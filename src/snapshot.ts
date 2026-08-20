import { CONFIG } from "./config";
import { openDb } from "./db";
import { computePolliScore, ValidatorSnapshotInput } from "./score";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Create delegation snapshot on day 20 before next delegation
 * Last snapshot: 09.01.2026
 * Next delegation: ~30.01.2026
 * Next snapshot: 29.01.2026 (20 days before)
 */
export async function createDelegationSnapshot() {
  const { db } = openDb(CONFIG.dbPath);
  const now = Date.now();
  
  // Parse last snapshot date
  const lastSnapshotDate = new Date(CONFIG.delegation.lastSnapshotDate + "T00:00:00Z");
  const lastSnapshotTs = lastSnapshotDate.getTime();
  
  // Calculate next delegation date
  const delegationCycleMs = CONFIG.delegation.delegationCycleDays * DAY_MS;
  const nextDelegationTs = lastSnapshotTs + delegationCycleMs;
  
  // Calculate snapshot date (20 days before next delegation)
  const snapshotDaysBeforeMs = CONFIG.delegation.snapshotDaysBefore * DAY_MS;
  const nextSnapshotTs = nextDelegationTs - snapshotDaysBeforeMs;
  
  // Check if it's time to create snapshot
  const daysUntilSnapshot = (nextSnapshotTs - now) / DAY_MS;
  
  if (daysUntilSnapshot > 1) {
    // Too early, skip
    return { created: false, reason: `Next snapshot in ${Math.ceil(daysUntilSnapshot)} days` };
  }
  
  // Check if snapshot already exists for this date
  const snapshotDate = new Date(nextSnapshotTs).toISOString().split("T")[0]; // YYYY-MM-DD
  const existing = db
    .prepare("SELECT COUNT(*) as count FROM delegation_snapshots WHERE snapshot_date = ?")
    .get(snapshotDate) as { count: number };
  
  if (existing.count > 0) {
    return { created: false, reason: `Snapshot for ${snapshotDate} already exists` };
  }
  
  // Get latest validator snapshots
  const validators = db
    .prepare(`
      SELECT s.*
      FROM validator_snapshots s
      JOIN (
        SELECT operator_address, MAX(ts) AS ts
        FROM validator_snapshots
        GROUP BY operator_address
      ) latest
      ON latest.operator_address = s.operator_address AND latest.ts = s.ts
      WHERE s.status = 'BOND_STATUS_BONDED'
      ORDER BY s.operator_address
    `)
    .all() as any[];
  
  // Get last snapshot for each validator to calculate metrics
  const getLastSnapshot = db.prepare(`
    SELECT ts, missed_blocks_counter
    FROM delegation_snapshots
    WHERE operator_address = ?
    ORDER BY ts DESC
    LIMIT 1
  `);
  
  // Get history since last snapshot for jail events
  const getHistory = db.prepare(`
    SELECT ts, missed_blocks_counter, signed_blocks_window, jailed, jailed_until
    FROM validator_snapshots
    WHERE operator_address = ? AND ts > ?
    ORDER BY ts ASC
  `);
  
  const insert = db.prepare(`
    INSERT INTO delegation_snapshots (
      snapshot_date, ts, operator_address, moniker, status, jailed, tokens,
      commission_rate, missed_blocks_counter, signed_blocks_window,
      jailed_until, tombstoned, score, polli_score, polli_eligible,
      missed_blocks_21d, slashes_21d, uptime_21d, raw_json
    ) VALUES (
      @snapshot_date, @ts, @operator_address, @moniker, @status, @jailed, @tokens,
      @commission_rate, @missed_blocks_counter, @signed_blocks_window,
      @jailed_until, @tombstoned, @score, @polli_score, @polli_eligible,
      @missed_blocks_21d, @slashes_21d, @uptime_21d, @raw_json
    )
  `);
  
  const tx = db.transaction((rows: any[]) => {
    for (const row of rows) insert.run(row);
  });
  
  const rows: any[] = [];
  
  for (const v of validators) {
    const lastSnapshot = getLastSnapshot.get(v.operator_address) as { ts?: number; missed_blocks_counter?: number } | undefined;
    // If no snapshot found, use the configured last snapshot date
    const lastSnapshotData = lastSnapshot ? {
      ts: lastSnapshot.ts!,
      missed_blocks_counter: lastSnapshot.missed_blocks_counter!
    } : {
      ts: lastSnapshotTs,
      missed_blocks_counter: v.missed_blocks_counter // Use current as baseline for first snapshot
    };
    
    const snapshotTs = lastSnapshotData.ts;
    const historySinceSnapshot = getHistory.all(v.operator_address, snapshotTs) as Array<{
      ts: number;
      missed_blocks_counter: number;
      signed_blocks_window: number;
      jailed: number;
      jailed_until: string | null;
    }>;
    
    const historyFormatted = historySinceSnapshot.map(s => ({
      ts: s.ts,
      missed_blocks_counter: s.missed_blocks_counter,
      signed_blocks_window: s.signed_blocks_window,
      jailed: Boolean(s.jailed),
      jailed_until: s.jailed_until
    }));
    
    const input: ValidatorSnapshotInput = {
      ts: v.ts,
      operator_address: v.operator_address,
      moniker: v.moniker,
      status: v.status,
      jailed: Boolean(v.jailed),
      tokens: v.tokens,
      commission_rate: v.commission_rate,
      commission_max_rate: v.commission_max_rate,
      commission_max_change_rate: v.commission_max_change_rate,
      missed_blocks_counter: v.missed_blocks_counter,
      signed_blocks_window: v.signed_blocks_window,
      jailed_until: v.jailed_until,
      tombstoned: Boolean(v.tombstoned)
    };
    
    const polliScored = computePolliScore(input, lastSnapshotData, historyFormatted);
    
    rows.push({
      snapshot_date: snapshotDate,
      ts: now,
      operator_address: v.operator_address,
      moniker: v.moniker,
      status: v.status,
      jailed: v.jailed ? 1 : 0,
      tokens: v.tokens,
      commission_rate: v.commission_rate,
      missed_blocks_counter: v.missed_blocks_counter,
      signed_blocks_window: v.signed_blocks_window,
      jailed_until: v.jailed_until ?? null,
      tombstoned: v.tombstoned ? 1 : 0,
      score: v.score,
      polli_score: polliScored.score,
      polli_eligible: polliScored.eligible ? 1 : 0,
      missed_blocks_21d: polliScored.missed_blocks_21d,
      slashes_21d: polliScored.slashes_21d,
      uptime_21d: polliScored.uptime_21d,
      raw_json: JSON.stringify({
        validator: v,
        polliBreakdown: polliScored.breakdown
      })
    });
  }
  
  tx(rows);
  
  return {
    created: true,
    snapshot_date: snapshotDate,
    count: rows.length,
    next_delegation_date: new Date(nextDelegationTs).toISOString().split("T")[0]
  };
}
