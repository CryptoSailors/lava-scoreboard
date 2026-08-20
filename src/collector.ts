import { CONFIG } from "./config";
import { openDb } from "./db";
import { lavadJson } from "./lavad";
import { computeScore, computePolliScore, ValidatorSnapshotInput } from "./score";
import { createDelegationSnapshot } from "./snapshot";

type SlashingParamsResponse = {
  signed_blocks_window?: string;
  params?: { signed_blocks_window?: string };
};

type StakingValidatorsResponse = {
  validators?: any[];
  pagination?: { next_key?: string | null };
};

type SigningInfoResponse = {
  address?: string;
  start_height?: string;
  index_offset?: string;
  jailed_until?: string;
  tombstoned?: boolean;
  missed_blocks_counter?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toInt(x: unknown, fallback = 0): number {
  const n = typeof x === "string" ? parseInt(x, 10) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : fallback;
}

async function getSignedBlocksWindow(): Promise<number> {
  const res = await lavadJson<SlashingParamsResponse>(
    { lavadBin: CONFIG.lavadBin, chainId: CONFIG.chainId, node: CONFIG.node },
    ["query", "slashing", "params"]
  );
  const w = res.params?.signed_blocks_window ?? res.signed_blocks_window ?? "0";
  return Math.max(1, toInt(w, 1));
}

async function getAllValidators(): Promise<any[]> {
  // Use a single big limit to avoid pagination complexity on chains that don't expose page keys cleanly.
  const res = await lavadJson<StakingValidatorsResponse>(
    { lavadBin: CONFIG.lavadBin, chainId: CONFIG.chainId, node: CONFIG.node },
    ["query", "staking", "validators", "--limit", String(CONFIG.validatorsLimit)]
  );
  return res.validators ?? [];
}

async function getSigningInfo(consPubKeyJson: any): Promise<SigningInfoResponse | null> {
  // Lava's `lavad query slashing signing-info` expects `validator-conspub` (JSON) rather than valcons address.
  const consPub = JSON.stringify(consPubKeyJson);
  try {
    return await lavadJson<SigningInfoResponse>(
      { lavadBin: CONFIG.lavadBin, chainId: CONFIG.chainId, node: CONFIG.node },
      ["query", "slashing", "signing-info", consPub]
    );
  } catch (e: any) {
    const msg = (e as Error)?.message ?? "";
    // Some validators may not have signing info (NotFound in slashing store). Skip them.
    if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("not found")) {
      return null;
    }
    throw e;
  }
}

function normalizeValidatorRow(v: any, signedBlocksWindow: number, signingInfo: SigningInfoResponse, ts: number) {
  const input: ValidatorSnapshotInput = {
    ts,
    operator_address: String(v.operator_address ?? ""),
    moniker: String(v.description?.moniker ?? ""),
    status: String(v.status ?? ""),
    jailed: Boolean(v.jailed),
    tokens: String(v.tokens ?? "0"),
    commission_rate: String(v.commission?.commission_rates?.rate ?? "0"),
    commission_max_rate: String(v.commission?.commission_rates?.max_rate ?? "0"),
    commission_max_change_rate: String(v.commission?.commission_rates?.max_change_rate ?? "0"),
    missed_blocks_counter: toInt(signingInfo.missed_blocks_counter ?? "0", 0),
    signed_blocks_window: signedBlocksWindow,
    jailed_until: signingInfo.jailed_until ?? null,
    tombstoned: Boolean(signingInfo.tombstoned)
  };

  const scored = computeScore(input);
  return { input, scored };
}

async function collectOnce() {
  const { db } = openDb(CONFIG.dbPath);
  const ts = Date.now();
  
  // Check if it's time to create delegation snapshot (on day 20 before next delegation)
  try {
    const snapshotResult = await createDelegationSnapshot();
    if (snapshotResult.created) {
      console.log(`[collector] Created delegation snapshot: ${snapshotResult.snapshot_date}, next delegation: ${snapshotResult.next_delegation_date}`);
    }
  } catch (e) {
    console.error("[collector] Failed to create delegation snapshot:", e);
  }
  
  const signedBlocksWindow = await getSignedBlocksWindow();
  const validators = await getAllValidators();

  // Get first seen timestamp for each validator (for Polli 21-day minimum check)
  const getFirstSeen = db.prepare(`
    SELECT MIN(ts) as first_ts
    FROM validator_snapshots
    WHERE operator_address = ?
  `);

  // Try to add polli_score column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE validator_snapshots ADD COLUMN polli_score REAL`);
  } catch (e: any) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE validator_snapshots ADD COLUMN polli_eligible INTEGER`);
  } catch (e: any) {
    // Column already exists, ignore
  }

  const insert = db.prepare(`
    INSERT INTO validator_snapshots (
      ts, operator_address, moniker, status, jailed, tokens,
      commission_rate, commission_max_rate, commission_max_change_rate,
      missed_blocks_counter, signed_blocks_window,
      jailed_until, tombstoned, score, polli_score, polli_eligible, raw_json
    ) VALUES (
      @ts, @operator_address, @moniker, @status, @jailed, @tokens,
      @commission_rate, @commission_max_rate, @commission_max_change_rate,
      @missed_blocks_counter, @signed_blocks_window,
      @jailed_until, @tombstoned, @score, @polli_score, @polli_eligible, @raw_json
    )
  `);

  const tx = db.transaction((rows: any[]) => {
    for (const row of rows) insert.run(row);
  });

  const rows: any[] = [];

  for (const v of validators) {
    const op = String(v.operator_address ?? "");
    const moniker = String(v.description?.moniker ?? "");
    try {
      const signingInfo = await getSigningInfo(v.consensus_pubkey);
      if (!signingInfo) {
        continue;
      }
      const { input, scored } = normalizeValidatorRow(v, signedBlocksWindow, signingInfo, ts);
      
      // Get last delegation snapshot (for calculating metrics since last snapshot)
      const lastSnapshot = db
        .prepare(`
          SELECT ts, missed_blocks_counter
          FROM delegation_snapshots
          WHERE operator_address = ?
          ORDER BY ts DESC
          LIMIT 1
        `)
        .get(op) as { ts?: number; missed_blocks_counter?: number } | undefined;
      
      // If no snapshot in DB, use configured last snapshot date as baseline
      const lastSnapshotDate = new Date(CONFIG.delegation.lastSnapshotDate + "T00:00:00Z");
      const lastSnapshotTsFromConfig = lastSnapshotDate.getTime();
      
      // Get missed_blocks_counter from snapshot closest to lastSnapshotDate
      // Try to find snapshot on or after the snapshot date, otherwise use the closest one before
      const snapshotOnOrAfter = db
        .prepare(`
          SELECT missed_blocks_counter, ts
          FROM validator_snapshots
          WHERE operator_address = ? AND ts >= ?
          ORDER BY ts ASC
          LIMIT 1
        `)
        .get(op, lastSnapshotTsFromConfig) as { missed_blocks_counter?: number; ts?: number } | undefined;
      
      const snapshotBefore = db
        .prepare(`
          SELECT missed_blocks_counter, ts
          FROM validator_snapshots
          WHERE operator_address = ? AND ts < ?
          ORDER BY ts DESC
          LIMIT 1
        `)
        .get(op, lastSnapshotTsFromConfig) as { missed_blocks_counter?: number; ts?: number } | undefined;
      
      // Use snapshot on/after date if available, otherwise use closest before
      const baselineSnapshot = snapshotOnOrAfter || snapshotBefore;
      
      const lastSnapshotData = lastSnapshot ? {
        ts: lastSnapshot.ts!,
        missed_blocks_counter: lastSnapshot.missed_blocks_counter!
      } : baselineSnapshot ? {
        ts: baselineSnapshot.ts ?? lastSnapshotTsFromConfig,
        missed_blocks_counter: baselineSnapshot.missed_blocks_counter ?? input.missed_blocks_counter
      } : {
        ts: lastSnapshotTsFromConfig,
        missed_blocks_counter: input.missed_blocks_counter // Fallback: use current as baseline (will show 0 missed blocks)
      };
      
      // Get historical snapshots since last snapshot for jail events counting
      const lastSnapshotTs = lastSnapshotData.ts;
      const historySinceSnapshot = db
        .prepare(`
          SELECT ts, missed_blocks_counter, signed_blocks_window, jailed, jailed_until
          FROM validator_snapshots
          WHERE operator_address = ? AND ts > ?
          ORDER BY ts ASC
        `)
        .all(op, lastSnapshotTs) as Array<{
        ts: number;
        missed_blocks_counter: number;
        signed_blocks_window: number;
        jailed: number;
        jailed_until: string | null;
      }>;
      
      // Convert to format expected by computePolliScore
      const historyFormatted = historySinceSnapshot.map(s => ({
        ts: s.ts,
        missed_blocks_counter: s.missed_blocks_counter,
        signed_blocks_window: s.signed_blocks_window,
        jailed: Boolean(s.jailed),
        jailed_until: s.jailed_until
      }));
      
      // Calculate Polli score from last snapshot
      const polliScored = computePolliScore(input, lastSnapshotData, historyFormatted);
      
      rows.push({
        ts: input.ts,
        operator_address: input.operator_address,
        moniker: input.moniker,
        status: input.status,
        jailed: input.jailed ? 1 : 0,
        tokens: input.tokens,
        commission_rate: input.commission_rate,
        commission_max_rate: input.commission_max_rate,
        commission_max_change_rate: input.commission_max_change_rate,
        missed_blocks_counter: input.missed_blocks_counter,
        signed_blocks_window: input.signed_blocks_window,
        jailed_until: input.jailed_until ?? null,
        tombstoned: input.tombstoned ? 1 : 0,
        score: scored.score,
        polli_score: polliScored.score,
        polli_eligible: polliScored.eligible ? 1 : 0,
        raw_json: JSON.stringify({ 
          validator: v, 
          signingInfo, 
          breakdown: scored.breakdown,
          polliBreakdown: polliScored.breakdown,
          missed_blocks_21d: polliScored.missed_blocks_21d,
          slashes_21d: polliScored.slashes_21d,
          uptime_21d: polliScored.uptime_21d
        })
      });
    } catch (e) {
      // Keep going; one broken validator shouldn't break the collector.
      console.error(`[collector] failed for ${moniker} (${op}):`, (e as Error).message);
    }
  }

  tx(rows);
  console.log(`[collector] inserted ${rows.length}/${validators.length} snapshots @ ${new Date(ts).toISOString()}`);
}

async function main() {
  console.log(`[collector] starting; interval=${CONFIG.collectIntervalSec}s, node=${CONFIG.node}, chainId=${CONFIG.chainId}`);
  while (true) {
    try {
      await collectOnce();
    } catch (e) {
      console.error("[collector] collectOnce failed:", e);
    }
    await sleep(CONFIG.collectIntervalSec * 1000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


