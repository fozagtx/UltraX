import { describe, expect, it } from "vitest";
import { buildRunners, buildSignal } from "./builders.js";
import { UniverseService } from "./universe.js";
import { OkxClient } from "../okx/client.js";

describe("live OKX predictive intelligence", () => {
  it.skipIf(process.env.LIVE !== "1")(
    "refreshes NVDA and ANTHROPIC from public v5 REST",
    async () => {
      const universe = new UniverseService(
        new OkxClient(process.env.OKX_REST_BASE ?? "https://www.okx.com"),
        { candleSymbols: ["NVDA", "ANTHROPIC"] },
      );
      await universe.refresh();
      const snapshot = universe.snapshot();
      expect(snapshot).not.toBeNull();
      expect(
        snapshot!.perps.find((instrument) => instrument.symbol === "NVDA"),
      ).toBeDefined();
      const anthropic = await buildSignal(
        snapshot!,
        "ANTHROPIC",
        "weekly",
        (instId) => universe.positioning(instId),
      );
      expect(anthropic.preIpo).toBeTruthy();
      expect(anthropic.preIpo.impliedValuationUsd).toBeGreaterThan(10_000_000_000);

      const runners = buildRunners(snapshot!, {
        period: "weekly",
        market: "perp",
        direction: "up",
        limit: 5,
        minVolumeUsd: 100_000,
      });
      expect(runners.runners.length).toBeGreaterThan(0);
      expect(snapshot!.calibrations.perp[1]!.samples).toBeGreaterThan(0);
    },
    180_000,
  );
});
