import { CONFIG } from "./config";

export type ValidatorSnapshotInput = {
  ts: number;
  operator_address: string;
  moniker: string;
  status: string;
  jailed: boolean;
  tokens: string;
  commission_rate: string;
  commission_max_rate: string;
  commission_max_change_rate: string;
  missed_blocks_counter: number;
  signed_blocks_window: number;
  jailed_until?: string | null;
  tombstoned: boolean;
};

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function parseRate(x: string): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeScore(v: ValidatorSnapshotInput): { score: number; breakdown: Record<string, number> } {
  // Hard failures
  if (v.tombstoned) {
    return { score: 0, breakdown: { tombstoned: 0 } };
  }

  const now = v.ts;

  // Reliability: based on slashing window + jail recency.
  const window = Math.max(1, v.signed_blocks_window);
  const signingRate = clamp01(1 - v.missed_blocks_counter / window); // 0..1

  let jailPenalty = 0;
  if (v.jailed) jailPenalty = 1;
  if (v.jailed_until) {
    const t = Date.parse(v.jailed_until);
    if (Number.isFinite(t)) {
      // Penalize if jail is recent (last 21 days) or still active.
      const recent = now - t < 21 * DAY_MS;
      const active = t > now;
      if (active || recent) jailPenalty = 1;
    }
  }

  const reliabilityScore01 = clamp01(signingRate - jailPenalty * 0.75);

  // Economics: commission competitiveness (lower = better).
  // Use max_rate as a "ceiling" for normalization when available; fallback to 0.2.
  const rate = clamp01(parseRate(v.commission_rate));
  const maxRate = Math.max(0.01, clamp01(parseRate(v.commission_max_rate)) || 0.2);
  const econScore01 = clamp01(1 - rate / maxRate);

  // Liveness: bonded is required; otherwise heavy penalty.
  const bonded = v.status === "BOND_STATUS_BONDED";
  const livenessScore01 = bonded ? 1 : 0.2;

  // Weighted total
  const reliability = reliabilityScore01 * 0.60;
  const economics = econScore01 * 0.25;
  const liveness = livenessScore01 * 0.15;
  const total01 = clamp01(reliability + economics + liveness);
  const score = Math.round(total01 * 10000) / 100; // 0..100 with 2 decimals

  return {
    score,
    breakdown: {
      signingRate: Math.round(signingRate * 10000) / 10000,
      jailPenalty,
      reliabilityScore01: Math.round(reliabilityScore01 * 10000) / 10000,
      econScore01: Math.round(econScore01 * 10000) / 10000,
      livenessScore01: Math.round(livenessScore01 * 10000) / 10000
    }
  };
}

/**
 * Compute Polli-style score based on their criteria:
 * - Uptime over last 3 weeks (21 days) - main parameter
 * - Slashing events (penalties)
 * - Validator status (must be BONDED)
 * - Minimum operational period: 21 days
 * 
 * Uptime calculation:
 * - If history21d is provided: calculates REAL 21-day uptime from historical snapshots
 *   by comparing missed_blocks_counter from 21 days ago vs now
 * - If history21d is not available: falls back to current signing window approximation
 *   (signed_blocks_window, typically 3500 blocks ≈ 5.8 hours, not 21 days)
 */
type HistoricalSnapshot = {
  ts: number;
  missed_blocks_counter: number;
  signed_blocks_window: number;
  jailed: boolean;
  jailed_until?: string | null;
};

type LastSnapshot = {
  ts: number;
  missed_blocks_counter: number;
};

export function computePolliScore(
  v: ValidatorSnapshotInput,
  lastSnapshot?: LastSnapshot | null,
  historySinceSnapshot?: HistoricalSnapshot[]
): { 
  score: number; 
  breakdown: Record<string, number>; 
  eligible: boolean;
  missed_blocks_21d: number;
  slashes_21d: number;
  uptime_21d: number;
} {
  const now = v.ts;
  const MIN_OPERATIONAL_DAYS = 21;
  const MIN_OPERATIONAL_MS = MIN_OPERATIONAL_DAYS * DAY_MS;

  // Hard failures: tombstoned = 0
  if (v.tombstoned) {
    return { 
      score: 0, 
      breakdown: { tombstoned: 0 }, 
      eligible: false,
      missed_blocks_21d: 0,
      slashes_21d: 0,
      uptime_21d: 0
    };
  }

  // Check minimum operational period (21 days)
  // We need at least 21 days since last snapshot
  const lastSnapshotTs = lastSnapshot?.ts ?? null;
  const daysSinceSnapshot = lastSnapshotTs ? (now - lastSnapshotTs) / DAY_MS : 0;
  const meetsMinPeriod = lastSnapshotTs ? daysSinceSnapshot >= MIN_OPERATIONAL_DAYS : false;

  // Status check: must be BONDED
  const isBonded = v.status === "BOND_STATUS_BONDED";
  if (!isBonded) {
    return { 
      score: 0, 
      breakdown: { status: 0, notBonded: 1 }, 
      eligible: false,
      missed_blocks_21d: 0,
      slashes_21d: 0,
      uptime_21d: 0
    };
  }

  // Uptime calculation (main parameter for Polli)
  // Calculate from last snapshot to now
  let missedBlocks21d = 0;
  let uptimeRate = 0;
  let uptimeMethod = "no_data";
  
  if (lastSnapshot) {
    // Calculate missed blocks delta since last snapshot
    missedBlocks21d = Math.max(0, v.missed_blocks_counter - lastSnapshot.missed_blocks_counter);
    
    // Calculate actual days since snapshot (may be less than 21 days)
    const actualDays = Math.max(1, daysSinceSnapshot);
    
    // Estimate blocks in actual period: days * 24h * 60min * 60sec / block_time_sec
    // Use block time from config (default 6 seconds for Lava)
    const blocksInPeriod = Math.floor((actualDays * 24 * 60 * 60) / CONFIG.blockTimeSec);
    
    // Uptime = 1 - (missed blocks / total blocks in period)
    if (blocksInPeriod > 0) {
      const missedRatio = Math.max(0, Math.min(1, missedBlocks21d / blocksInPeriod));
      uptimeRate = clamp01(1 - missedRatio);
      uptimeMethod = "from_snapshot";
    }
  }

  // Slashing events penalty - count unique jail events since last snapshot
  // Count transitions from not-jailed to jailed, not every snapshot with jail status
  let slashes21d = 0;
  let slashingPenalty = 0;
  
  if (historySinceSnapshot && historySinceSnapshot.length > 0) {
    const lastSnapshotTs = lastSnapshot?.ts ?? 0;
    let wasJailed = false; // Track previous state
    
    for (let i = 0; i < historySinceSnapshot.length; i++) {
      const snap = historySinceSnapshot[i];
      if (snap.ts <= lastSnapshotTs) continue;
      
      const isJailed = Boolean(snap.jailed || (snap.jailed_until && Date.parse(snap.jailed_until) > snap.ts));
      
      // Count transition from not-jailed to jailed
      if (!wasJailed && isJailed) {
        slashes21d++;
      }
      
      wasJailed = isJailed;
    }
  }
  
  // Check current state for jail and penalty
  if (v.jailed) {
    slashingPenalty = 1; // Active jail = disqualifying
    // Check if this is a new jail (transition)
    if (!historySinceSnapshot || historySinceSnapshot.length === 0) {
      slashes21d++; // First snapshot, count as new jail
    } else {
      const lastHistory = historySinceSnapshot[historySinceSnapshot.length - 1];
      const wasJailedInLast = lastHistory.jailed || 
        (lastHistory.jailed_until && Date.parse(lastHistory.jailed_until) > lastHistory.ts);
      if (!wasJailedInLast) {
        slashes21d++; // Transition to jailed, count it
      }
    }
  } else if (v.jailed_until) {
    const jailedUntil = Date.parse(v.jailed_until);
    if (Number.isFinite(jailedUntil)) {
      const lastSnapshotTs = lastSnapshot?.ts ?? 0;
      if (jailedUntil > lastSnapshotTs) {
        // Jail happened since last snapshot
        if (jailedUntil > now) {
          // Still jailed
          slashingPenalty = 1;
        } else {
          // Jail was recent (within period since snapshot) - heavy penalty
          const daysSinceJail = (now - jailedUntil) / DAY_MS;
          slashingPenalty = 1 - (daysSinceJail / MIN_OPERATIONAL_DAYS) * 0.5; // 0.5 to 1.0 penalty
        }
        // Check if this is a new jail event
        if (!historySinceSnapshot || historySinceSnapshot.length === 0) {
          slashes21d++; // First snapshot, count as new jail
        } else {
          const lastHistory = historySinceSnapshot[historySinceSnapshot.length - 1];
          const wasJailedInLast = lastHistory.jailed || 
            (lastHistory.jailed_until && Date.parse(lastHistory.jailed_until) > lastHistory.ts);
          if (!wasJailedInLast && jailedUntil > lastSnapshotTs) {
            slashes21d++; // Transition to jailed, count it
          }
        }
      }
    }
  }

  // Calculate score: uptime is primary, slashing is penalty
  // Polli says: "higher uptime over the last 3 weeks means better performance"
  let score = uptimeRate;
  
  // Apply slashing penalty
  if (slashingPenalty > 0) {
    score = score * (1 - slashingPenalty * 0.5); // Reduce score by up to 50% for slashing
  }

  // If doesn't meet minimum period, reduce score but don't set to 0
  // Polli requires 21 days, but we still show score for transparency
  if (!meetsMinPeriod && lastSnapshotTs) {
    // Validator is tracked but <21 days since snapshot: reduce score proportionally
    const daysRatio = Math.max(0, daysSinceSnapshot / MIN_OPERATIONAL_DAYS);
    score = score * daysRatio;
  }

  const finalScore = Math.round(score * 10000) / 100; // 0..100 with 2 decimals

  return {
    score: finalScore,
    breakdown: {
      uptimeRate: Math.round(uptimeRate * 10000) / 10000,
      uptimeMethod: uptimeMethod === "from_snapshot" ? 1 : 0,
      slashingPenalty: Math.round(slashingPenalty * 10000) / 10000,
      daysSinceSnapshot: Math.round(daysSinceSnapshot * 100) / 100,
      meetsMinPeriod: meetsMinPeriod ? 1 : 0,
      isBonded: isBonded ? 1 : 0,
      rawScore: Math.round(score * 10000) / 100
    },
    eligible: meetsMinPeriod && isBonded && !v.tombstoned && !v.jailed,
    missed_blocks_21d: missedBlocks21d,
    slashes_21d: slashes21d,
    uptime_21d: Math.round(uptimeRate * 10000) / 100 // 0..100 with 2 decimals
  };
}


