import { describe, expect, it } from "vitest";
import { runCheck, type CheckDeps } from "./check.js";
import type { MarketState } from "./rules/marketHours.js";

const NOW = new Date("2026-09-23T15:00:00Z"); // market open
const OPEN: MarketState = {
  open: true,
  reason: "open",
  nextChange: "2026-09-23T20:00:00.000Z",
};
const CLOSED: MarketState = {
  open: false,
  reason: "after-hours",
  nextChange: "2026-09-24T13:30:00.000Z",
};

function makeDeps(overrides: Partial<CheckDeps> = {}): CheckDeps {
  return {
    now: NOW,
    marketState: () => OPEN,
    stockPrice: async () => ({ price: 200, asOf: NOW.getTime() - 60_000 }),
    okxTicker: async () => ({ last: 221, ts: NOW.getTime() - 30_000 }),
    xlayerPrice: async () => ({ price: 220.5, time: NOW.getTime() - 10_000 }),
    multiplier: async () => 1.1,
    tokenDecimals: async () => 18,
    dexQuote: async ({ amount }) => ({
      // sell: ~2.27 tokens at ~218 -> ~494 raw USDT0 (6dp) = ~98.8% of 500
      toTokenAmount: BigInt(Math.round((Number(amount) / 1e18) * 218 * 1e6)),
      priceImpactPct: -0.2,
      toDecimals: 6,
    }),
    ...overrides,
  };
}

const REQ = { ticker: "NVDAx", side: "sell" as const, sizeUSD: 500 };

describe("runCheck", () => {
  it("OK verdict with all sources healthy", async () => {
    const r = await runCheck(makeDeps(), REQ);
    expect(r.verdict).toBe("OK");
    expect(r.price.realStock).toBe(200);
    expect(r.price.okxExchange).toBe(221);
    expect(r.price.multiplier).toBe(1.1);
    expect(r.price.xlayerToken).toBe(220.5);
    expect(r.price.marketOpen).toBe(true);
    expect(r.exit.expectedUSD).toBeGreaterThan(0);
    expect(r.payment.priceUsd).toBe(0.005);
    expect(r.sources.okxExchange).toBe("okx-ticker");
    expect(r.rights.type).toContain("Tracker");
  });

  it("CAUTION when market closed", async () => {
    const r = await runCheck(
      makeDeps({ marketState: () => CLOSED }),
      REQ,
    );
    expect(r.verdict).toBe("CAUTION");
    expect(r.reasons).toContain("US market closed");
  });

  it("STOP when the dex quote rejects", async () => {
    const r = await runCheck(
      makeDeps({ dexQuote: async () => Promise.reject(new Error("no route")) }),
      REQ,
    );
    expect(r.verdict).toBe("STOP");
    expect(r.reasons.join(" ")).toContain("No exit available");
  });

  it("STOP when xlayer price rejects", async () => {
    const r = await runCheck(
      makeDeps({ xlayerPrice: async () => Promise.reject(new Error("down")) }),
      REQ,
    );
    expect(r.verdict).toBe("STOP");
  });

  it("STOP on >3% gap", async () => {
    const r = await runCheck(
      makeDeps({ xlayerPrice: async () => ({ price: 230, time: NOW.getTime() }) }),
      REQ,
    );
    expect(r.verdict).toBe("STOP");
    expect(r.reasons.join(" ")).toContain("above");
  });

  it("STOP on stale stock price while market open", async () => {
    const r = await runCheck(
      makeDeps({
        stockPrice: async () => ({
          price: 200,
          asOf: NOW.getTime() - 20 * 60_000,
        }),
      }),
      REQ,
    );
    expect(r.verdict).toBe("STOP");
    expect(r.reasons.join(" ")).toContain("stale");
  });

  it("stale stock price is not flagged while market closed", async () => {
    const r = await runCheck(
      makeDeps({
        marketState: () => CLOSED,
        stockPrice: async () => ({
          price: 200,
          asOf: NOW.getTime() - 60 * 60_000,
        }),
      }),
      REQ,
    );
    expect(r.verdict).toBe("CAUTION"); // market closed, not STOP
  });

  it("okx ticker failure is not fatal", async () => {
    const r = await runCheck(
      makeDeps({ okxTicker: async () => Promise.reject(new Error("down")) }),
      REQ,
    );
    expect(r.verdict).toBe("OK");
    expect(r.price.okxExchange).toBeNull();
    expect(r.sources.okxExchange).toBeNull();
  });

  it("buy side quotes USDT0->wrapper and values output at stock*m", async () => {
    const r = await runCheck(
      makeDeps({
        dexQuote: async () => ({
          toTokenAmount: 2_400_000_000_000_000_000n, // 2.4 tokens
          priceImpactPct: -0.1,
          toDecimals: 18,
        }),
      }),
      { ticker: "NVDAx", side: "buy", sizeUSD: 500 },
    );
    // 2.4 tokens * 200 * 1.1 = 528 -> 105.6% of size
    expect(r.exit.expectedUSD).toBeCloseTo(528, 1);
  });
});
