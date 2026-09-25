import { calibrate } from "./calibrate.js";
import { log } from "../log.js";
import { OkxClient } from "../okx/client.js";
import {
  emptyRubikPositioning,
  parseCandleRows,
  parseFundingRows,
  parseIndexRows,
  parseInstrumentRows,
  parseOpenInterestRows,
  parseOrderBookRow,
  parseRubikLongShortRows,
  parseRubikOpenInterestRows,
  parseRubikTakerRows,
  parseTickerRows,
} from "../okx/parsers.js";
import type {
  Bar,
  Funding,
  IndexPrice,
  Instrument,
  MarketSnapshot,
  MarketType,
  OpenInterest,
  OrderBook,
  Positioning,
  RubikPositioning,
  Ticker,
  UniverseProvider,
  UniverseStatus,
} from "./types.js";

const TICKERS_TTL_MS = 60_000;
const CANDLES_TTL_MS = 15 * 60_000;
const RUBIK_TTL_MS = 15 * 60_000;

interface UniverseOptions {
  candleSymbols?: string[];
}

interface RubikCache {
  expiresAt: number;
  value: RubikPositioning;
}

export class UniverseService implements UniverseProvider {
  private perps: Instrument[] = [];
  private spots: Instrument[] = [];
  private tickers: Record<string, Ticker> = {};
  private indices: Record<string, IndexPrice> = {};
  private funding: Record<string, Funding> = {};
  private openInterest: Record<string, OpenInterest> = {};
  private series: Record<string, Bar[]> = {};
  private calibrations: MarketSnapshot["calibrations"] = {
    perp: {},
    spot: {},
  };
  private ready = false;
  private updatedAt = new Date(0).toISOString();
  private candlesRefreshedAt: string | null = null;
  private tickersRefreshedAt: string | null = null;
  private refreshJob: Promise<void> | null = null;
  private readonly rubikCache = new Map<string, RubikCache>();
  private readonly candleSymbols: Set<string> | null;

  constructor(
    private readonly client: OkxClient,
    options: UniverseOptions = {},
  ) {
    this.candleSymbols = options.candleSymbols
      ? new Set(options.candleSymbols.map((symbol) => symbol.toUpperCase()))
      : null;
  }

  refresh(): Promise<void> {
    if (this.refreshJob) return this.refreshJob;
    const job = this.refreshInternal();
    this.refreshJob = job;
    const clear = () => {
      if (this.refreshJob === job) this.refreshJob = null;
    };
    void job.then(clear, clear);
    return job;
  }

  status(): UniverseStatus {
    return {
      ready: this.ready,
      perps: this.perps.length,
      spots: this.spots.length,
      preIpo: this.perps.filter((instrument) => instrument.preIpo).length,
      candlesRefreshedAt: this.candlesRefreshedAt,
      tickersRefreshedAt: this.tickersRefreshedAt,
    };
  }

  snapshot(): MarketSnapshot | null {
    if (!this.ready) return null;
    const series: Record<string, Bar[]> = {};
    for (const [instId, original] of Object.entries(this.series)) {
      const bars = original.map((bar) => ({ ...bar }));
      const last = bars.at(-1);
      const ticker = this.tickers[instId];
      if (last && ticker && !last.confirmed) {
        last.close = ticker.last;
        last.high = Math.max(last.high, ticker.last);
        last.low = Math.min(last.low, ticker.last);
      }
      series[instId] = bars;
    }
    return {
      perps: this.perps.map((instrument) => ({ ...instrument })),
      spots: this.spots.map((instrument) => ({ ...instrument })),
      tickers: { ...this.tickers },
      indices: { ...this.indices },
      funding: { ...this.funding },
      openInterest: { ...this.openInterest },
      series,
      calibrations: this.calibrations,
      updatedAt: this.updatedAt,
      candlesRefreshedAt: this.candlesRefreshedAt,
      tickersRefreshedAt: this.tickersRefreshedAt,
    };
  }

  async positioning(instId: string): Promise<Positioning> {
    const cached = this.rubikCache.get(instId);
    let rubik = cached && cached.expiresAt > Date.now() ? cached.value : null;
    if (!rubik) {
      rubik = await this.loadRubik(instId);
      this.rubikCache.set(instId, {
        expiresAt: Date.now() + RUBIK_TTL_MS,
        value: rubik,
      });
    }
    const funding = this.funding[instId];
    const interest = this.openInterest[instId];
    return {
      fundingRate: funding?.fundingRate ?? null,
      nextFundingTime: funding?.nextFundingTime ?? null,
      openInterestUsd: interest?.oiUsd ?? null,
      ...rubik,
    };
  }

  async orderBook(instId: string): Promise<OrderBook | null> {
    const rows = await this.client.get<Record<string, unknown>>(
      `/api/v5/market/books?instId=${encodeURIComponent(instId)}&sz=400`,
    );
    return rows[0] ? parseOrderBookRow(rows[0]) : null;
  }

  private async refreshInternal(): Promise<void> {
    const now = Date.now();
    const tickersDue =
      !this.tickersRefreshedAt ||
      now - Date.parse(this.tickersRefreshedAt) >= TICKERS_TTL_MS;

    if (tickersDue) {
      const [
        swapInstruments,
        spotInstruments,
        swapTickers,
        spotTickers,
        indexRows,
        fundingRows,
        interestRows,
      ] = await Promise.all([
        this.client.get<Record<string, unknown>>(
          "/api/v5/public/instruments?instType=SWAP",
        ),
        this.client.get<Record<string, unknown>>(
          "/api/v5/public/instruments?instType=SPOT",
        ),
        this.client.get<Record<string, unknown>>(
          "/api/v5/market/tickers?instType=SWAP",
        ),
        this.client.get<Record<string, unknown>>(
          "/api/v5/market/tickers?instType=SPOT",
        ),
        this.client.get<Record<string, unknown>>(
          "/api/v5/market/index-tickers?quoteCcy=USDT",
        ),
        this.client.get<Record<string, unknown>>(
          "/api/v5/public/funding-rate?instId=ANY",
        ),
        this.client.get<Record<string, unknown>>(
          "/api/v5/public/open-interest?instType=SWAP",
        ),
      ]);
      this.perps = parseInstrumentRows(swapInstruments, "perp");
      this.spots = parseInstrumentRows(spotInstruments, "spot");
      this.tickers = {
        ...parseTickerRows(swapTickers, "perp"),
        ...parseTickerRows(spotTickers, "spot"),
      };
      this.indices = parseIndexRows(indexRows);
      this.funding = parseFundingRows(fundingRows);
      this.openInterest = parseOpenInterestRows(interestRows);
      this.tickersRefreshedAt = new Date().toISOString();
      this.updatedAt = this.tickersRefreshedAt;
    }

    const instruments = [...this.perps, ...this.spots].filter(
      (instrument) =>
        this.candleSymbols === null ||
        this.candleSymbols.has(instrument.symbol.toUpperCase()),
    );
    const candlesDue =
      !this.candlesRefreshedAt ||
      now - Date.parse(this.candlesRefreshedAt) >= CANDLES_TTL_MS;
    const toFetch = candlesDue
      ? instruments
      : instruments.filter((instrument) => !this.series[instrument.instId]);
    if (toFetch.length > 0) {
      await Promise.all(
        toFetch.map(async (instrument) => {
          try {
            const rows = await this.client.get<unknown>(
              `/api/v5/market/candles?instId=${encodeURIComponent(instrument.instId)}&bar=1Dutc&limit=300`,
            );
            this.series[instrument.instId] = parseCandleRows(rows);
          } catch (error) {
            log("warn", "instrument candles skipped", {
              instId: instrument.instId,
              err: String(error),
            });
          }
        }),
      );
      this.candlesRefreshedAt = new Date().toISOString();
      this.recomputeCalibrations();
    }
    this.ready = true;
    this.updatedAt = new Date().toISOString();
  }

  private recomputeCalibrations(): void {
    const byMarket: Record<MarketType, Record<string, Bar[]>> = {
      perp: {},
      spot: {},
    };
    for (const instrument of this.perps) {
      const bars = this.series[instrument.instId];
      if (bars) byMarket.perp[instrument.instId] = bars;
    }
    for (const instrument of this.spots) {
      const bars = this.series[instrument.instId];
      if (bars) byMarket.spot[instrument.instId] = bars;
    }
    this.calibrations = {
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
    };
  }

  private async loadRubik(instId: string): Promise<RubikPositioning> {
    const empty = emptyRubikPositioning();
    const paths = [
      `/api/v5/rubik/stat/contracts/open-interest-history?instId=${encodeURIComponent(instId)}&period=1Dutc&limit=40`,
      `/api/v5/rubik/stat/contracts/long-short-account-ratio-contract?instId=${encodeURIComponent(instId)}&period=1Dutc&limit=1`,
      `/api/v5/rubik/stat/taker-volume-contract?instId=${encodeURIComponent(instId)}&period=1Dutc&unit=2&limit=40`,
    ];
    const [oiRows, ratioRows, takerRows] = await Promise.all(
      paths.map(async (path) => {
        try {
          return await this.client.rubik<unknown>(path);
        } catch (error) {
          log("warn", "Rubik positioning unavailable", {
            instId,
            err: String(error),
          });
          return null;
        }
      }),
    );
    if (oiRows) {
      try {
        empty.oiHistory = parseRubikOpenInterestRows(oiRows);
      } catch (error) {
        log("warn", "Rubik open-interest unavailable", {
          instId,
          err: String(error),
        });
      }
    }
    if (ratioRows) {
      try {
        empty.longShortAccountRatio = parseRubikLongShortRows(ratioRows);
      } catch (error) {
        log("warn", "Rubik long-short ratio unavailable", {
          instId,
          err: String(error),
        });
      }
    }
    if (takerRows) {
      try {
        empty.takerVolume = parseRubikTakerRows(takerRows);
      } catch (error) {
        log("warn", "Rubik taker-volume unavailable", {
          instId,
          err: String(error),
        });
      }
    }
    return empty;
  }
}
