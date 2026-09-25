import { describe, expect, it } from "vitest";
import { okxSign } from "./sources/okxAuth.js";
import { parsePriceInfo } from "./sources/okxMarket.js";
import { parseDexQuote } from "./sources/okxDexQuote.js";
import { parseTicker } from "./sources/okxTicker.js";
import { validateCheckRequest } from "./check.js";

describe("okxSign", () => {
  it("prehash is timestamp+METHOD+path", () => {
    const s = okxSign("secret", "2026-01-01T00:00:00.000Z", "GET", "/a?b=1");
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(20);
  });
  it("POST prehash includes body", () => {
    const get = okxSign("k", "t", "GET", "/p?x=1");
    const post = okxSign("k", "t", "POST", "/p?x=1[{\"a\":1}]");
    expect(get).not.toBe(post);
  });
});

describe("parsePriceInfo", () => {
  it("parses data[0].price and time", () => {
    const r = parsePriceInfo([{ price: "123.45", time: "1720000000000" }]);
    expect(r.price).toBe(123.45);
    expect(r.time).toBe(1720000000000);
  });
  it("throws on missing price", () => {
    expect(() => parsePriceInfo([{ time: "1" }])).toThrow();
    expect(() => parsePriceInfo([])).toThrow();
  });
});

describe("parseDexQuote", () => {
  // fixture shape from OKX docs quick-start
  const fixture = [
    {
      chainIndex: "196",
      fromToken: { decimal: "6", tokenContractAddress: "0xusdt0" },
      toToken: { decimal: "18", tokenContractAddress: "0xwrapper" },
      fromTokenAmount: "500000000",
      toTokenAmount: "2234567890123456789",
      priceImpactPercent: "-0.45",
    },
  ];
  it("parses toTokenAmount, priceImpactPercent, toToken.decimal", () => {
    const q = parseDexQuote(fixture);
    expect(q.toTokenAmount).toBe(2234567890123456789n);
    expect(q.priceImpactPct).toBeCloseTo(-0.45);
    expect(q.toDecimals).toBe(18);
  });
  it("throws on empty/zero amount", () => {
    expect(() => parseDexQuote([])).toThrow();
    expect(() => parseDexQuote([{ toTokenAmount: "0" }])).toThrow();
  });
});

describe("parseTicker", () => {
  it("parses v5 ticker", () => {
    const t = parseTicker({
      code: "0",
      data: [{ instId: "XNVDA-USDT", last: "224.5", ts: "1720000000000" }],
    });
    expect(t.last).toBe(224.5);
    expect(t.ts).toBe(1720000000000);
  });
  it("rejects non-zero code", () => {
    expect(() => parseTicker({ code: "1", data: [] })).toThrow();
  });
});

describe("validateCheckRequest", () => {
  it("accepts valid", () => {
    const r = validateCheckRequest({
      ticker: "nvdaX",
      side: "sell",
      sizeUSD: 500,
    });
    expect(r.ok).toBe(true);
  });
  it("rejects unknown ticker", () => {
    expect(
      validateCheckRequest({ ticker: "FOO", side: "sell", sizeUSD: 1 }).ok,
    ).toBe(false);
  });
  it("rejects bad side and size", () => {
    expect(
      validateCheckRequest({ ticker: "NVDAx", side: "hold", sizeUSD: 1 }).ok,
    ).toBe(false);
    expect(
      validateCheckRequest({ ticker: "NVDAx", side: "buy", sizeUSD: 0 }).ok,
    ).toBe(false);
    expect(
      validateCheckRequest({
        ticker: "NVDAx",
        side: "buy",
        sizeUSD: 1_000_001,
      }).ok,
    ).toBe(false);
  });
});
