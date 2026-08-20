/**
 * Retention for the snapshot tables.
 *
 * Why this exists: nothing in this project ever deleted a row. At ~44 snapshots
 * per validator per day the database reached 6.1 GB / 3.0M rows in seven months,
 * on a RAID5 array shared with validator nodes whose block commits compete for
 * the same fsync.
 *
 * Strategy — thin, don't truncate:
 *   - every row younger than RETENTION_FULL_DAYS is kept as is;
 *   - beyond that, one row per validator per calendar day survives (the earliest);
 *   - each validator's oldest row is never deleted, so baselines that older code
 *     compares against stay reachable.
 *
 * Deletes run in batches with a pause between them: a single large delete on this
 * array measurably raises fsync latency for every process on the host.
 *
 * VACUUM is NOT run by default. It rewrites the entire file, which is exactly the
 * I/O spike we are trying to avoid; freed pages are reused by SQLite anyway, so
 * the file stops growing without it. Pass --vacuum deliberately, off-peak.
 *
 * Usage:  node dist/prune.js [--dry-run] [--days=14] [--vacuum]
 */
import { openDb } from "./db";
import { CONFIG } from "./config";

const TABLES = ["validator_snapshots", "polli_snapshots"] as const;
const BATCH = 5000;
const PAUSE_MS = 250;

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const VACUUM = args.includes("--vacuum");
const daysArg = args.find((a) => a.startsWith("--days="));
const FULL_DAYS = daysArg ? Number(daysArg.split("=")[1]) : 14;

if (!Number.isFinite(FULL_DAYS) || FULL_DAYS < 1) {
  console.error(`[prune] invalid --days value: ${daysArg}`);
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pruneTable(db: any, table: string, cutoff: number) {
  const before = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c as number;

  db.exec(`DROP TABLE IF EXISTS temp.keep_${table}`);
  db.exec(`
    CREATE TEMP TABLE keep_${table} AS
      SELECT MIN(id) AS id FROM ${table}
       WHERE ts < ${cutoff}
       GROUP BY operator_address, CAST(ts / 86400000 AS INTEGER)
      UNION
      SELECT MIN(id) AS id FROM ${table} GROUP BY operator_address
  `);
  db.exec(`CREATE INDEX temp.idx_keep_${table} ON keep_${table}(id)`);

  const pick = db.prepare(`
    SELECT id FROM ${table}
     WHERE ts < ?
       AND id NOT IN (SELECT id FROM keep_${table})
     LIMIT ${BATCH}
  `);
  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM ${table}
     WHERE ts < ? AND id NOT IN (SELECT id FROM keep_${table})
  `).get(cutoff).c as number;

  console.log(`[prune] ${table}: ${before} rows, ${total} eligible for removal`);
  if (DRY || total === 0) {
    db.exec(`DROP TABLE IF EXISTS temp.keep_${table}`);
    return { before, deleted: 0, total };
  }

  const delStmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
  const delMany = db.transaction((ids: number[]) => {
    for (const id of ids) delStmt.run(id);
  });

  let deleted = 0;
  for (;;) {
    const ids = pick.all(cutoff).map((r: any) => r.id as number);
    if (ids.length === 0) break;
    delMany(ids);
    deleted += ids.length;
    process.stdout.write(`\r[prune] ${table}: deleted ${deleted}/${total}`);
    await sleep(PAUSE_MS);
  }
  process.stdout.write("\n");
  db.exec(`DROP TABLE IF EXISTS temp.keep_${table}`);
  return { before, deleted, total };
}

async function main() {
  const { db } = openDb(CONFIG.dbPath);
  const cutoff = Date.now() - FULL_DAYS * 86400000;
  console.log(
    `[prune] keeping every row after ${new Date(cutoff).toISOString()} ` +
      `(${FULL_DAYS}d), one per validator per day before it` +
      (DRY ? "  [DRY RUN]" : "")
  );

  for (const t of TABLES) await pruneTable(db, t, cutoff);

  if (VACUUM && !DRY) {
    console.log("[prune] VACUUM (rewrites the whole file — expect heavy I/O)");
    db.exec("VACUUM");
  }
  console.log("[prune] done");
}

main().catch((e) => {
  console.error("[prune] failed:", e);
  process.exit(1);
});
