import { CONFIG } from "./config";
import { openDb } from "./db";

type PolliValidator = {
  address: string;
  name: string;
  status: string;
  statusReason?: string | null;
  validatorCommissionRate?: number | string;
  validatorAnnualPercentageRate?: number | string;
  networkAnnualPercentageRate?: number | string;
  totalStakedTokens?: { value: string; currency: string };
  votingPower?: string;
  scoringRate?: string | number;
  uptimePercentageRate?: number;
  uptimeRateLastWindow?: number;
  slashCount?: number;
  lastJailedRecover?: any;
  imageUrl?: string;
};

type PolliResponse = {
  data: PolliValidator[];
  pagination?: { totalCount?: number };
};

function parseNumber(x: unknown, fallback = 0): number {
  const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : fallback;
}

async function fetchPolliValidators(): Promise<PolliValidator[]> {
  const { baseUrl, wallet } = CONFIG.polli;
  if (!baseUrl || !wallet) {
    throw new Error("Polli collector: POLLI_BASE_URL or POLLI_WALLET is not set");
  }
  const url = `${baseUrl}/api-cosmos/public/wallets/${encodeURIComponent(
    wallet
  )}/validators?size=1000&walletAddress=${encodeURIComponent(wallet)}`;
  // Node fetch не має таймауту за замовчуванням — без AbortSignal зависле
  // з'єднання зупиняє збір без жодного сліду в логах.
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Polli fetch failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as PolliResponse;
  return json.data ?? [];
}

async function collectOnce() {
  const validators = await fetchPolliValidators();
  const { db } = openDb(CONFIG.dbPath);
  const ts = Date.now();

  const insert = db.prepare(`
    INSERT INTO polli_snapshots (
      ts, operator_address, moniker, status, status_reason, scoring_rate,
      voting_power, commission_rate, validator_apr, network_apr,
      total_staked_tokens, uptime_percentage_rate, uptime_rate_last_window,
      slash_count, last_jailed_recover, raw_json
    ) VALUES (
      @ts, @operator_address, @moniker, @status, @status_reason, @scoring_rate,
      @voting_power, @commission_rate, @validator_apr, @network_apr,
      @total_staked_tokens, @uptime_percentage_rate, @uptime_rate_last_window,
      @slash_count, @last_jailed_recover, @raw_json
    )
  `);

  const tx = db.transaction((rows: any[]) => {
    for (const r of rows) insert.run(r);
  });

  const rows: any[] = [];
  for (const v of validators) {
    rows.push({
      ts,
      operator_address: v.address,
      moniker: v.name || "",
      status: v.status || "",
      status_reason: v.statusReason ?? null,
      scoring_rate: parseNumber(v.scoringRate, 0),
      voting_power: v.votingPower ?? null,
      commission_rate: parseNumber(v.validatorCommissionRate, NaN),
      validator_apr: parseNumber(v.validatorAnnualPercentageRate, NaN),
      network_apr: parseNumber(v.networkAnnualPercentageRate, NaN),
      total_staked_tokens: v.totalStakedTokens?.value ?? null,
      uptime_percentage_rate: parseNumber(v.uptimePercentageRate, NaN),
      uptime_rate_last_window: parseNumber(v.uptimeRateLastWindow, NaN),
      slash_count: typeof v.slashCount === "number" ? v.slashCount : null,
      last_jailed_recover: v.lastJailedRecover ? JSON.stringify(v.lastJailedRecover) : null,
      raw_json: JSON.stringify(v)
    });
  }

  tx(rows);
  console.log(`[polli-collector] inserted ${rows.length} snapshots @ ${new Date(ts).toISOString()}`);
}

async function main() {
  if (!CONFIG.polli.baseUrl || !CONFIG.polli.wallet) {
    console.error("[polli-collector] POLLI_BASE_URL or POLLI_WALLET not set; exiting.");
    return;
  }
  console.log(
    `[polli-collector] start; base=${CONFIG.polli.baseUrl}, wallet=${CONFIG.polli.wallet}, interval=${CONFIG.collectIntervalSec}s`
  );
  while (true) {
    try {
      await collectOnce();
    } catch (e) {
      console.error("[polli-collector] collectOnce failed:", e);
    }
    await new Promise((r) => setTimeout(r, CONFIG.collectIntervalSec * 1000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


