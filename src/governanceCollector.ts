import { CONFIG } from "./config";
import { collectGovernanceOnce } from "./governance";

const INTERVAL_MS = (CONFIG.collectIntervalSec || 600) * 1000;

async function main() {
  console.log(
    `[governance-collector] starting; interval=${CONFIG.collectIntervalSec}s, node=${CONFIG.node}, chainId=${CONFIG.chainId}`
  );

  // Collect immediately
  try {
    await collectGovernanceOnce();
  } catch (err) {
    console.error(`[governance-collector] initial collect failed:`, err);
  }

  // Then collect on interval
  setInterval(async () => {
    try {
      await collectGovernanceOnce();
    } catch (err) {
      console.error(`[governance-collector] collectOnce failed:`, err);
    }
  }, INTERVAL_MS);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[governance-collector] fatal:", err);
    process.exit(1);
  });
}
