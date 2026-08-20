import * as path from "path";
import * as fs from "fs";
import dotenv from "dotenv";

// Load .env if present (not committed). This repo includes env.example.
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function pickRpc(): string {
  // Avoid NODE because it may point to the node binary path from nvm.
  const candidates = [
    process.env.LAVA_RPC,
    process.env.RPC_URL,
    process.env.RPC,
    process.env.RPC_ENDPOINT,
    process.env.RPC_NODE,
    process.env.COSMOS_RPC,
    process.env.ENDPOINT
  ];
  for (const c of candidates) {
    if (c && c.trim()) return c.trim();
  }
  return "tcp://127.0.0.1:26657";
}

export const CONFIG = {
  lavadBin: req("LAVAD_BIN", "lavad"),
  chainId: req("CHAIN_ID", "lava-mainnet-1"),
  node: pickRpc(),
  // Archive node for governance (optional; falls back to regular node if not set)
  // Remove trailing slash if present
  archiveNode: process.env.ARCHIVE_NODE?.trim()?.replace(/\/+$/, "") || undefined,
  dbPath: req("DB_PATH", "./data/lava.sqlite"),
  port: parseInt(req("PORT", "8080"), 10),
  collectIntervalSec: parseInt(req("COLLECT_INTERVAL_SEC", "600"), 10),
  validatorsLimit: parseInt(req("VALIDATORS_LIMIT", "2000"), 10),
  polli: {
    baseUrl: process.env.POLLI_BASE_URL?.trim(),
    wallet: process.env.POLLI_WALLET?.trim(),
    chain: process.env.POLLI_CHAIN?.trim() ?? "LAVA",
    lastReviewTs: process.env.POLLI_LAST_REVIEW_TS
      ? parseInt(process.env.POLLI_LAST_REVIEW_TS, 10)
      : undefined
  },
  delegation: {
    // Last delegation snapshot date (YYYY-MM-DD format)
    // Next snapshot will be 20 days before next delegation (29.01.2026)
    lastSnapshotDate: process.env.LAST_DELEGATION_SNAPSHOT_DATE?.trim() ?? "2026-01-09",
    // Days between delegations (typically 21)
    delegationCycleDays: parseInt(process.env.DELEGATION_CYCLE_DAYS ?? "21", 10),
    // Days before delegation to create snapshot (typically 20, so snapshot on day 20 before delegation)
    snapshotDaysBefore: parseInt(process.env.SNAPSHOT_DAYS_BEFORE ?? "20", 10)
  },
  // Block time in seconds (for calculating expected blocks in period)
  blockTimeSec: parseInt(process.env.BLOCK_TIME_SEC ?? "6", 10)
};


