import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseCandleRows,
  parseEnvelope,
  parseFundingRows,
  parseIndexRows,
  parseInstrumentRows,
  parseOpenInterestRows,
  parseOrderBookRow,
  parseRubikLongShortRows,
  parseRubikOpenInterestRows,
  parseRubikTakerRows,
  parseTickerRows,
} from "./parsers.js";
import type { OkxEnvelope } from "./parsers.js";

function fixture<T>(name: string): OkxEnvelope<T> {
  return JSON.parse(
    readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"),
  ) as OkxEnvelope<T>;
}

describe("OKX v5 response parsers", () => {
  it("parses stock perp and xStock spot instruments from captured responses", () => {
    const perps = parseInstrumentRows(
      fixture<Record<string, unknown>>("instruments-swap.json").data,
      "perp",
    );
    const spots = parseInstrumentRows(
      fixture<Record<string, unknown>>("instruments-spot.json").data,
      "spot",
    );
    expect(perps.map((instrument) => instrument.symbol)).toContain("NVDA");
    expect(
      perps.find((instrument) => instrument.symbol === "ANTHROPIC")?.preIpo,
    ).toBe(true);
    expect(spots[0]).toMatchObject({
      symbol: "XNVDA",
      instId: "XNVDA-USDT",
      market: "spot",
    });
  });

  it("parses tickers, index, funding, and open interest", () => {
    const swapTickers = parseTickerRows(
      fixture<Record<string, unknown>>("tickers-swap.json").data,
      "perp",
    );
    const spotTickers = parseTickerRows(
      fixture<Record<string, unknown>>("tickers-spot.json").data,
      "spot",
    );
    const rawSwap = fixture<Record<string, unknown>>("tickers-swap.json").data.find(
      (ticker) => ticker.instId === "NVDA-USDT-SWAP",
    )!;
    const nvda = swapTickers["NVDA-USDT-SWAP"]!;
    expect(nvda.vol24hUsd).toBe(
      Number(rawSwap.volCcy24h) * Number(rawSwap.last),
    );
    expect(spotTickers["XNVDA-USDT"]!.vol24hUsd).toBeGreaterThan(0);
    expect(
      parseIndexRows(
        fixture<Record<string, unknown>>("index.json").data,
      )["NVDA-USDT"]!.idxPx,
    ).toBeGreaterThan(0);
    expect(
      parseFundingRows(
        fixture<Record<string, unknown>>("funding.json").data,
      )["NVDA-USDT-SWAP"]!.fundingRate,
    ).not.toBeNull();
    expect(
      parseOpenInterestRows(
        fixture<Record<string, unknown>>("open-interest.json").data,
      )["NVDA-USDT-SWAP"]!.oiUsd,
    ).toBeGreaterThan(0);
  });

  it("sorts candle rows ascending and uses quote volume and confirmation", () => {
    const candles = parseCandleRows(
      fixture<unknown>("candles-nvda-swap.json").data,
    );
    expect(candles.length).toBeGreaterThan(100);
    expect(candles[0]!.ts).toBeLessThan(candles.at(-1)!.ts);
    expect(candles.at(-1)!.confirmed).toBe(false);
    expect(candles.at(-1)!.volume).toBeGreaterThan(0);
  });

  it("parses all three Rubik series and pre-IPO order books", () => {
    expect(
      parseRubikOpenInterestRows(
        fixture<unknown>("rubik-open-interest.json").data,
      ),
    ).toHaveLength(40);
    expect(
      parseRubikLongShortRows(
        fixture<unknown>("rubik-long-short.json").data,
      ),
    ).toBeGreaterThan(0);
    expect(
      parseRubikTakerRows(fixture<unknown>("rubik-taker.json").data),
    ).toHaveLength(40);
    const book = parseOrderBookRow(
      fixture<Record<string, unknown>>("books-anthropic.json").data[0]!,
    );
    expect(book.bids.length).toBeGreaterThan(0);
    expect(book.asks.length).toBeGreaterThan(0);
  });

  it("rejects unexpected envelopes and OKX error codes", () => {
    expect(() => parseEnvelope({})).toThrow("unexpected OKX response envelope");
    expect(() => parseEnvelope({ code: "51000", data: [] })).toThrow(
      "OKX error code=51000",
    );
  });
});
