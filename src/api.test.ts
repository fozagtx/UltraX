import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { calibrate } from "./intel/calibrate.js";
import { buildPreIpo, buildPreview, buildRunners, buildSignal } from "./intel/builders.js";
import { createApp, challengeOnlyFacilitator } from "./server.js";
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
} from "./okx/parsers.js";
import type { OrderBook, Positioning, UniverseProvider } from "./intel/types.js";
import type { RunnerInput } from "./intel/input.js";
import type { MarketSnapshot } from "./intel/types.js";

const ENV = {
  NETWORK: "eip155:196",
  PAY_TO: "0x000000000000000000000000000000000000dEaD",
  PUBLIC_API_BASE_URL: "http://localhost:8080",
  WEB_ORIGIN: "*",
};

function fixture<T>(name: string): T[] {
  const parsed = JSON.parse(
    readFileSync(new URL(`./okx/__fixtures__/${name}`, import.meta.url), "utf8"),
  ) as { code: string; data: T[] };
  return parseEnvelope<T>(parsed).data;
}

function makeSnapshot(): MarketSnapshot {
  const perps = parseInstrumentRows(
    fixture<Record<string, unknown>>("instruments-swap.json"),
    "perp",
  );
  const spots = parseInstrumentRows(
    fixture<Record<string, unknown>>("instruments-spot.json"),
    "spot",
  );
  const series = {
    "NVDA-USDT-SWAP": parseCandleRows(fixture<unknown>("candles-nvda-swap.json")),
    "XNVDA-USDT": parseCandleRows(fixture<unknown>("candles-nvda-spot.json")),
    "ANTHROPIC-USDT-SWAP": parseCandleRows(
      fixture<unknown>("candles-anthropic.json"),
    ),
  };
  const byMarket = {
    perp: {
      "NVDA-USDT-SWAP": series["NVDA-USDT-SWAP"],
      "ANTHROPIC-USDT-SWAP": series["ANTHROPIC-USDT-SWAP"],
    },
    spot: { "XNVDA-USDT": series["XNVDA-USDT"] },
  };
  return {
    perps,
    spots,
    tickers: {
      ...parseTickerRows(
        fixture<Record<string, unknown>>("tickers-swap.json"),
        "perp",
      ),
      ...parseTickerRows(
        fixture<Record<string, unknown>>("tickers-spot.json"),
        "spot",
      ),
    },
    indices: parseIndexRows(fixture<Record<string, unknown>>("index.json")),
    funding: parseFundingRows(
      fixture<Record<string, unknown>>("funding.json"),
    ),
    openInterest: parseOpenInterestRows(
      fixture<Record<string, unknown>>("open-interest.json"),
    ),
    series,
    calibrations: {
      perp: {
        1: calibrate(byMarket.perp, 1),
        7: calibrate(byMarket.perp, 7),
        30: calibrate(byMarket.perp, 30),
      },
      spot: {
        1: calibrate(byMarket.spot, 1),
        7: calibrate(byMarket.spot, 7),
        30: calibrate(byMarket.spot, 30),
      },
    },
    books: {
      "ANTHROPIC-USDT-SWAP": parseOrderBookRow(
        fixture<Record<string, unknown>>("books-anthropic.json")[0]!,
      ),
    },
    updatedAt: new Date().toISOString(),
    candlesRefreshedAt: new Date().toISOString(),
    tickersRefreshedAt: new Date().toISOString(),
  };
}

const snapshot = makeSnapshot();
const rubikOi = parseRubikOpenInterestRows(
  fixture<unknown>("rubik-open-interest.json"),
);
const rubikLongShort = parseRubikLongShortRows(
  fixture<unknown>("rubik-long-short.json"),
);
const rubikTaker = parseRubikTakerRows(fixture<unknown>("rubik-taker.json"));
const book = parseOrderBookRow(
  fixture<Record<string, unknown>>("books-anthropic.json")[0]!,
);

function makeProvider(data: MarketSnapshot | null): UniverseProvider {
  return {
    snapshot: () => data,
    status: () => ({
      ready: data !== null,
      perps: data?.perps.length ?? 0,
      spots: data?.spots.length ?? 0,
      preIpo: data?.perps.filter((instrument) => instrument.preIpo).length ?? 0,
      candlesRefreshedAt: data?.candlesRefreshedAt ?? null,
      tickersRefreshedAt: data?.tickersRefreshedAt ?? null,
    }),
    async positioning(instId): Promise<Positioning> {
      return {
        fundingRate: data?.funding[instId]?.fundingRate ?? null,
        nextFundingTime: data?.funding[instId]?.nextFundingTime ?? null,
        openInterestUsd: data?.openInterest[instId]?.oiUsd ?? null,
        oiHistory: instId === "NVDA-USDT-SWAP" ? rubikOi : [],
        longShortAccountRatio:
          instId === "NVDA-USDT-SWAP" ? rubikLongShort : null,
        takerVolume: instId === "NVDA-USDT-SWAP" ? rubikTaker : [],
      };
    },
    async orderBook(instId): Promise<OrderBook | null> {
      return instId === "ANTHROPIC-USDT-SWAP" ? book : null;
    },
  };
}

function appFor(data: MarketSnapshot | null = snapshot) {
  return createApp({
    env: ENV,
    universe: makeProvider(data),
    facilitator: challengeOnlyFacilitator(ENV.NETWORK),
    syncFacilitatorOnStart: true,
  });
}

describe("API", () => {
  it("serves the free health, catalog, universe, preview, and payments endpoints", async () => {
    const app = appFor();
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body.service).toBe("UltraX");
    expect(health.body.universe.ready).toBe(true);

    const catalog = await request(app).get("/catalog");
    expect(catalog.status).toBe(200);
    expect(catalog.body.name).toBe("UltraX");
    expect(catalog.body.tagline).toBe(
      "Market intelligence for everything stocks on OKX",
    );
    expect(catalog.body.endpoints.paid).toHaveLength(3);

    const universe = await request(app).get("/universe");
    expect(universe.status).toBe(200);
    expect(universe.body.counts.perps).toBeGreaterThan(0);
    expect(universe.body.perps.map((item: { symbol: string }) => item.symbol)).toContain(
      "NVDA",
    );

    const preview = await request(app).get("/preview");
    expect(preview.status).toBe(200);
    expect(preview.body.runners.daily.length).toBeGreaterThan(0);
    expect(Object.keys(preview.body.runners.daily[0]).sort()).toEqual(
      ["closes", "last", "preIpo", "returnPct", "symbol"].sort(),
    );
    expect(preview.body.runners.daily[0].closes).toBeInstanceOf(Array);
    expect(
      preview.body.runners.daily[0].closes.every(
        (c: unknown) => typeof c === "number",
      ),
    ).toBe(true);
    expect(preview.body.runners.daily[0]).not.toHaveProperty("score");

    const payments = await request(app).get("/payments/recent");
    expect(payments.status).toBe(200);
    expect(payments.body.payTo).toBe(ENV.PAY_TO);
    expect(payments.body.payments).toEqual([]);
  });

  it("validates required fields and rejects unknown or non-pre-IPO symbols before payment", async () => {
    const app = appFor();
    const runners = await request(app).post("/runners").send({});
    expect(runners.status).toBe(400);
    expect(runners.body.status).toBe("input_required");
    expect(runners.body.missing).toEqual(["period"]);
    expect(runners.body.required.period.enum).toEqual([
      "daily",
      "weekly",
      "monthly",
    ]);

    const signal = await request(app).post("/signal").send({});
    expect(signal.status).toBe(400);
    expect(signal.body.status).toBe("input_required");
    expect(signal.body.missing).toEqual(["symbol"]);

    const unknown = await request(app)
      .post("/signal")
      .send({ symbol: "NOT-A-STOCK" });
    expect(unknown.status).toBe(400);
    expect(unknown.body.hint).toBe("GET /universe");

    const notPreIpo = await request(app)
      .post("/preipo")
      .send({ symbol: "NVDA" });
    expect(notPreIpo.status).toBe(400);
  });

  it("issues x402 challenges for all valid unpaid paid routes", async () => {
    const app = appFor();
    const cases = [
      ["/runners", { period: "weekly" }, "10000"],
      ["/signal", { symbol: "NVDA" }, "5000"],
      ["/preipo", {}, "10000"],
    ] as const;
    for (const [path, body, amount] of cases) {
      const response = await request(app).post(path).send(body);
      expect(response.status, response.text).toBe(402);
      const header = response.headers["payment-required"];
      expect(header).toBeTruthy();
      const decoded = JSON.parse(
        Buffer.from(header, "base64").toString("utf8"),
      ) as { accepts: { amount: string; payTo: string }[] };
      expect(decoded.accepts[0]!.amount).toBe(amount);
      expect(decoded.accepts[0]!.payTo.toLowerCase()).toBe(
        ENV.PAY_TO.toLowerCase(),
      );
    }
  });

  it("returns 503 before payment while the universe is warming", async () => {
    const app = appFor(null);
    const cases = [
      ["/runners", { period: "daily" }],
      ["/signal", { symbol: "NVDA" }],
      ["/preipo", {}],
    ] as const;
    for (const [path, body] of cases) {
      const response = await request(app).post(path).send(body);
      expect(response.status).toBe(503);
      expect(response.body.error).toBe("universe warming up");
    }
  });

  it("builds fixture-backed runners, per-stock signals, and pre-IPO tables", async () => {
    const runners = buildRunners(snapshot, {
      period: "weekly",
      market: "perp",
      direction: "up",
      limit: 10,
      minVolumeUsd: 100_000,
    } satisfies RunnerInput);
    expect(runners.runners.length).toBeGreaterThan(0);

    const signal = await buildSignal(snapshot, "NVDA-USDT-SWAP", "weekly", async (instId) =>
      makeProvider(snapshot).positioning(instId),
    );
    expect(signal.instId).toBe("NVDA-USDT-SWAP");
    expect(signal.horizons.weekly.horizonDays).toBe(7);
    expect(signal.positioning.fundingRate).not.toBeNull();
    expect(signal).toHaveProperty("spot.instId", "XNVDA-USDT");

    const preIpo = await buildPreIpo(
      snapshot,
      "ANTHROPIC",
      async () => book,
    );
    expect(preIpo.contracts).toHaveLength(1);
    expect(preIpo.contracts[0]!.company).toBe("Anthropic");
    expect(preIpo.contracts[0]!.estimatedShares).toBe(1_000_000_000);
    expect(preIpo.contracts[0]!.impliedValuationUsd).toBeGreaterThan(10_000_000_000);
    expect(preIpo.contracts[0]!.orderbook.spreadBps).not.toBeNull();

    const preview = await buildPreview(snapshot);
    expect(preview.model.calibration.daily.samples).toBeGreaterThan(0);
  });
});
