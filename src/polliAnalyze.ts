import { CONFIG } from "./config";

type PolliValidator = {
  scoringRate?: string | number;
  status?: string;
  statusReason?: string | null;
  uptimePercentageRate?: number;
  uptimeRateLastWindow?: number;
  slashCount?: number;
  validatorCommissionRate?: number | string;
  validatorAnnualPercentageRate?: number | string;
  votingPower?: string;
  totalStakedTokens?: { value: string; currency: string };
};

type PolliResponse = {
  data?: PolliValidator[];
  pagination?: { totalCount?: number };
};

function parseNum(x: unknown, fallback = 0): number {
  const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}
function std(arr: number[]): number {
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return 0;
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const mx = mean(x);
  const my = mean(y);
  const sx = std(x);
  const sy = std(y);
  if (sx === 0 || sy === 0) return 0;
  let cov = 0;
  for (let i = 0; i < n; i++) cov += (x[i] - mx) * (y[i] - my);
  return cov / (n * sx * sy);
}

async function fetchPolli(): Promise<PolliValidator[]> {
  const { baseUrl, wallet } = CONFIG.polli;
  if (!baseUrl || !wallet) throw new Error("Set POLLI_BASE_URL and POLLI_WALLET");
  const url = `${baseUrl}/api-cosmos/public/wallets/${encodeURIComponent(
    wallet
  )}/validators?size=1000&walletAddress=${encodeURIComponent(wallet)}`;
  // Node fetch не має таймауту за замовчуванням — без AbortSignal зависле
  // з'єднання зупиняє збір без жодного сліду в логах.
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Polli fetch failed ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as PolliResponse;
  return json.data ?? [];
}

async function main() {
  const data = await fetchPolli();
  const recommended = data.filter((v) => v.status !== "NOT_RECOMMENDED" && v.scoringRate !== undefined);

  const target = recommended.map((v) => parseNum(v.scoringRate, 0));

  const feats: Record<string, number[]> = {
    uptimeRateLastWindow: recommended.map((v) => parseNum(v.uptimeRateLastWindow, 0)),
    uptimePercentageRate: recommended.map((v) => parseNum(v.uptimePercentageRate, 0)),
    slashCount: recommended.map((v) => parseNum(v.slashCount, 0)),
    commission: recommended.map((v) => parseNum(v.validatorCommissionRate, 0)),
    validatorAPR: recommended.map((v) => parseNum(v.validatorAnnualPercentageRate, 0)),
    votingPowerLog: recommended.map((v) => {
      const vp = parseNum(v.votingPower, 0);
      return vp > 0 ? Math.log10(vp + 1) : 0;
    }),
    stakedLog: recommended.map((v) => {
      const val = parseNum(v.totalStakedTokens?.value, 0);
      return val > 0 ? Math.log10(val + 1) : 0;
    })
  };

  const correlations = Object.entries(feats).map(([k, arr]) => ({
    feature: k,
    pearson: Number(pearson(arr, target).toFixed(4))
  }));

  correlations.sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson));

  console.log("Polli sample size (recommended):", recommended.length);
  console.log("Top correlations with scoringRate (abs desc):");
  correlations.forEach((c) => console.log(`  ${c.feature}: ${c.pearson}`));

  // Show top 10 validators by Polli scoringRate for quick sanity check
  const top = recommended
    .map((v) => ({
      moniker: (v as any).name || "",
      scoringRate: parseNum(v.scoringRate, 0),
      uptime: parseNum(v.uptimeRateLastWindow, 0),
      commission: parseNum(v.validatorCommissionRate, 0),
      slashCount: parseNum(v.slashCount, 0)
    }))
    .sort((a, b) => b.scoringRate - a.scoringRate)
    .slice(0, 10);

  console.log("\nTop-10 by Polli scoringRate:");
  top.forEach((v, i) =>
    console.log(
      `${i + 1}. ${v.moniker} score=${v.scoringRate.toFixed(2)} uptime=${v.uptime.toFixed(
        2
      )}% comm=${v.commission.toFixed(2)}% slash=${v.slashCount}`
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


