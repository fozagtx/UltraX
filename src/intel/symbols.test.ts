import { describe, expect, it } from "vitest";
import { resolveSymbol } from "./symbols.js";
import type { Instrument, MarketSnapshot } from "./types.js";

const perp: Instrument = {
  symbol: "NVDA",
  instId: "NVDA-USDT-SWAP",
  market: "perp",
  preIpo: false,
  maxLeverage: 20,
  listedAt: null,
  baseCcy: "NVDA",
};
const spot: Instrument = {
  symbol: "XNVDA",
  instId: "XNVDA-USDT",
  market: "spot",
  preIpo: false,
  maxLeverage: 10,
  listedAt: null,
  baseCcy: "XNVDA",
};
const preIpo: Instrument = {
  symbol: "ANTHROPIC",
  instId: "ANTHROPIC-USDT-SWAP",
  market: "perp",
  preIpo: true,
  maxLeverage: 10,
  listedAt: null,
  baseCcy: "ANTHROPIC",
};
const snapshot = {
  perps: [perp, preIpo],
  spots: [spot],
} as MarketSnapshot;

describe("resolveSymbol", () => {
  it.each([
    ["NVDA", "NVDA-USDT-SWAP", "perp"],
    ["nvda", "NVDA-USDT-SWAP", "perp"],
    ["NVDA-USDT-SWAP", "NVDA-USDT-SWAP", "perp"],
    ["NVDA-USDT", "NVDA-USDT-SWAP", "perp"],
    ["XNVDA-USDT", "NVDA-USDT-SWAP", "perp"],
    ["XNVDA", "NVDA-USDT-SWAP", "perp"],
    ["NVDAx", "NVDA-USDT-SWAP", "perp"],
    ["ANTHROPIC", "ANTHROPIC-USDT-SWAP", "perp"],
  ])("resolves %s to %s (%s)", (input, instId, market) => {
    const resolved = resolveSymbol(input, snapshot);
    expect(resolved?.instrument.instId).toBe(instId);
    expect(resolved?.market).toBe(market);
  });

  it("resolves a spot-only instrument and rejects unknown symbols", () => {
    const spotOnly = {
      ...snapshot,
      perps: [preIpo],
    } as MarketSnapshot;
    expect(resolveSymbol("XNVDA-USDT", spotOnly)?.market).toBe("spot");
    expect(resolveSymbol("NOPE", snapshot)).toBeNull();
  });
});
