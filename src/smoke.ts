import { buildPreIpo, buildRunners, buildSignal } from "./intel/builders.js";
import { UniverseService } from "./intel/universe.js";
import { OkxClient } from "./okx/client.js";

async function main() {
  const universe = new UniverseService(
    new OkxClient(process.env.OKX_REST_BASE ?? "https://www.okx.com"),
  );
  await universe.refresh();
  const snapshot = universe.snapshot();
  if (!snapshot) throw new Error("universe did not become ready");

  console.log("universe", JSON.stringify(universe.status()));
  console.log("calibration", JSON.stringify(snapshot.calibrations, null, 2));
  for (const period of ["daily", "weekly", "monthly"] as const) {
    const response = buildRunners(snapshot, {
      period,
      market: "perp",
      direction: "up",
      limit: 5,
      minVolumeUsd: 100_000,
    });
    console.log(
      `top ${period} runners`,
      JSON.stringify(response.runners, null, 2),
    );
  }
  for (const symbol of ["NVDA", "ANTHROPIC"]) {
    const response = await buildSignal(
      snapshot,
      symbol,
      "weekly",
      (instId) => universe.positioning(instId),
    );
    console.log(`signal ${symbol}`, JSON.stringify(response, null, 2));
  }
  const preIpo = await buildPreIpo(
    snapshot,
    undefined,
    (instId) => universe.orderBook(instId),
  );
  console.log("pre-IPO table", JSON.stringify(preIpo, null, 2));
}

main().catch((error) => {
  console.error("smoke failed:", error);
  process.exit(1);
});
