import { DISCLAIMER } from "../config.js";
import { PRE_IPO_COMPANIES, PRE_IPO_RULES } from "../data/preipo.js";
import { isNyseOpen } from "../core/rules/marketHours.js";
import { calibrationForScore } from "./calibrate.js";
import { expectedRange, score, volatilityDaily } from "./score.js";
import { resolveSymbol } from "./symbols.js";
import { horizonDays } from "./types.js";
import type {
  Bar,
  Calibration,
  HorizonDays,
  Instrument,
  MarketSnapshot,
  MarketType,
  OrderBook,
  Period,
  Positioning,
  Signal,
  Ticker,
} from "./types.js";
import type { RunnerInput } from "./input.js";

function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current / previous) - 1) * 100;
}

function tickerFor(snapshot: MarketSnapshot, instrument: Instrument) {
  return snapshot.tickers[instrument.instId] ?? null;
}

function seriesFor(snapshot: MarketSnapshot, instrument: Instrument): Bar[] {
  return snapshot.series[instrument.instId] ?? [];
}

function getCalibration(
  snapshot: MarketSnapshot,
  market: MarketType,
  h: HorizonDays,
): Calibration {
  return (
    snapshot.calibrations[market][h] ?? {
      buckets: {
        strong_bear: { n: 0, up: 0, pUp: 0.5, avgFwdReturnPct: 0 },
        bear: { n: 0, up: 0, pUp: 0.5, avgFwdReturnPct: 0 },
        neutral: { n: 0, up: 0, pUp: 0.5, avgFwdReturnPct: 0 },
        bull: { n: 0, up: 0, pUp: 0.5, avgFwdReturnPct: 0 },
        strong_bull: { n: 0, up: 0, pUp: 0.5, avgFwdReturnPct: 0 },
      },
      samples: 0,
      baseUpRate: null,
      directionalSamples: 0,
      hitRate: null,
    }
  );
}

function getSignalFields(
  calibration: Calibration,
  scoreValue: number | null,
) {
  if (scoreValue === null) return { pUp: null, confidence: null };
  return calibrationForScore(calibration, scoreValue);
}

function linkedSpot(
  snapshot: MarketSnapshot,
  instrument: Instrument,
): Instrument | null {
  const perp = instrument.market === "perp" ? instrument : null;
  const symbol = perp?.symbol ?? instrument.symbol.replace(/^X/i, "");
  return (
    snapshot.spots.find(
      (spot) =>
        spot.symbol.toUpperCase() === `X${symbol.toUpperCase()}` ||
        spot.baseCcy.toUpperCase() === `X${symbol.toUpperCase()}`,
    ) ?? null
  );
}

function linkedPerp(
  snapshot: MarketSnapshot,
  instrument: Instrument,
): Instrument | null {
  const base = instrument.baseCcy.toUpperCase().replace(/^X/, "");
  return (
    snapshot.perps.find((perp) => perp.symbol.toUpperCase() === base) ?? null
  );
}

function trendFor(bars: Bar[], h: HorizonDays) {
  const t = bars.length - 1;
  const value = score(bars, t, h);
  return value;
}

function horizonBlock(
  snapshot: MarketSnapshot,
  instrument: Instrument,
  market: MarketType,
  h: HorizonDays,
) {
  const bars = seriesFor(snapshot, instrument);
  const t = bars.length - 1;
  const last = tickerFor(snapshot, instrument)?.last ?? bars[t]?.close ?? null;
  const historyReturn =
    t >= h && bars[t - h] && last !== null
      ? ((last / bars[t - h]!.close) - 1) * 100
      : null;
  const result = score(bars, t, h);
  const calibration = getCalibration(snapshot, market, h);
  const signalData = getSignalFields(calibration, result?.score ?? null);
  const sigma = volatilityDaily(bars, t);
  return {
    horizonDays: h,
    returnPct: historyReturn,
    score: result?.score ?? null,
    signal: result?.signal ?? null,
    ...signalData,
    expectedRange: last === null ? null : expectedRange(last, sigma, h),
    calibration: {
      hitRate: calibration.hitRate,
      samples: calibration.samples,
      baseUpRate: calibration.baseUpRate,
    },
    features: result?.features ?? null,
  };
}

function runnerRow(
  snapshot: MarketSnapshot,
  instrument: Instrument,
  market: MarketType,
  h: HorizonDays,
) {
  const bars = seriesFor(snapshot, instrument);
  const ticker = tickerFor(snapshot, instrument);
  const t = bars.length - 1;
  const last = ticker?.last ?? bars[t]?.close ?? null;
  const returnPct =
    last !== null && t >= h && bars[t - h]
      ? (last / bars[t - h]!.close - 1) * 100
      : null;
  const result = score(bars, t, h);
  const calibration = getCalibration(snapshot, market, h);
  const signalData = getSignalFields(calibration, result?.score ?? null);
  const sigma = volatilityDaily(bars, t);
  const row: Record<string, unknown> = {
    symbol: instrument.symbol,
    instId: instrument.instId,
    name: instrument.preIpo
      ? (PRE_IPO_COMPANIES[instrument.symbol]?.company ?? null)
      : null,
    market,
    preIpo: instrument.preIpo,
    last,
    returnPct,
    vol24hUsd: ticker?.vol24hUsd ?? 0,
    score: result?.score ?? null,
    signal: result?.signal ?? null,
    ...signalData,
    volumeRatio: result?.features.volumeRatio ?? null,
    rsi14: result?.features.rsi14 ?? null,
    trend: result?.features.trend ?? null,
    expectedRange: last === null ? null : expectedRange(last, sigma, h),
  };
  if (market === "perp") {
    const index = snapshot.indices[`${instrument.symbol}-USDT`];
    const spot = linkedSpot(snapshot, instrument);
    const spotLast = spot ? tickerFor(snapshot, spot)?.last ?? null : null;
    row.positioning = {
      fundingRate: snapshot.funding[instrument.instId]?.fundingRate ?? null,
      openInterestUsd: snapshot.openInterest[instrument.instId]?.oiUsd ?? null,
      premiumVsIndexPct:
        index && last !== null ? percentChange(last, index.idxPx) : null,
      basisVsSpotPct:
        spotLast !== null && last !== null
          ? percentChange(last, spotLast)
          : null,
    };
    row.spotInstId = spot?.instId ?? null;
  } else {
    row.perpSymbol = linkedPerp(snapshot, instrument)?.symbol ?? null;
  }
  return { row, returnPct };
}

export function buildRunners(
  snapshot: MarketSnapshot,
  input: RunnerInput,
  generatedAt = new Date().toISOString(),
) {
  const h = horizonDays(input.period);
  const instruments = input.market === "perp" ? snapshot.perps : snapshot.spots;
  const candidates = instruments
    .filter((instrument) => {
      const ticker = tickerFor(snapshot, instrument);
      const bars = seriesFor(snapshot, instrument);
      return (
        bars.length >= h + 1 &&
        (ticker?.vol24hUsd ?? 0) >= input.minVolumeUsd
      );
    })
    .map((instrument) => runnerRow(snapshot, instrument, input.market, h))
    .sort((left, right) => {
      const a = left.returnPct ?? (input.direction === "up" ? -Infinity : Infinity);
      const b = right.returnPct ?? (input.direction === "up" ? -Infinity : Infinity);
      return input.direction === "up" ? b - a : a - b;
    });
  return {
    period: input.period,
    horizonDays: h,
    market: input.market,
    direction: input.direction,
    generatedAt,
    dataAsOf: snapshot.tickersRefreshedAt,
    universeSize: instruments.length,
    eligible: candidates.length,
    runners: candidates.slice(0, input.limit).map(({ row }) => row),
    model: {
      name: "ultrax-momentum-v1",
      calibration: getCalibration(snapshot, input.market, h),
    },
    disclaimer: DISCLAIMER,
  };
}

function toIso(timestamp: number | null) {
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

function highLow(bars: Bar[]) {
  if (bars.length === 0) return { high: null, low: null };
  return {
    high: Math.max(...bars.map((bar) => bar.high)),
    low: Math.min(...bars.map((bar) => bar.low)),
  };
}

function orderBookStats(book: OrderBook | null) {
  if (!book || book.bids.length === 0 || book.asks.length === 0) {
    return { spreadBps: null, depth2pctUsd: { bid: null, ask: null } };
  }
  const bestBid = Math.max(...book.bids.map((level) => level.price));
  const bestAsk = Math.min(...book.asks.map((level) => level.price));
  const mid = (bestBid + bestAsk) / 2;
  const depth = (side: OrderBook["bids"], isBid: boolean) =>
    side.reduce((sum, level) => {
      const withinRange = isBid
        ? level.price >= mid * 0.98
        : level.price <= mid * 1.02;
      return sum + (withinRange ? level.price * level.size : 0);
    }, 0);
  return {
    spreadBps: ((bestAsk - bestBid) / mid) * 10_000,
    depth2pctUsd: {
      bid: depth(book.bids, true),
      ask: depth(book.asks, false),
    },
  };
}

export async function buildPreIpoContract(
  snapshot: MarketSnapshot,
  instrument: Instrument,
  fetchBook?: (instId: string) => Promise<OrderBook | null>,
) {
  const bars = seriesFor(snapshot, instrument);
  const ticker = tickerFor(snapshot, instrument);
  const last = ticker?.last ?? bars.at(-1)?.close ?? null;
  const first = bars[0] ?? null;
  const sevenDayReturn =
    bars.length > 7 && last !== null
      ? ((last / bars[bars.length - 1 - 7]!.close) - 1) * 100
      : null;
  const thirtyDayReturn =
    bars.length > 30 && last !== null
      ? ((last / bars[bars.length - 1 - 30]!.close) - 1) * 100
      : null;
  let book = snapshot.books?.[instrument.instId] ?? null;
  if (fetchBook) {
    try {
      book = await fetchBook(instrument.instId);
    } catch {
      book = null;
    }
  }
  const company = PRE_IPO_COMPANIES[instrument.symbol] ?? null;
  const weekly = horizonBlock(snapshot, instrument, "perp", 7);
  return {
    symbol: instrument.symbol,
    instId: instrument.instId,
    company: company?.company ?? null,
    listedAt: instrument.listedAt,
    daysListed:
      instrument.listedAt === null
        ? null
        : Math.floor(
            (Date.now() - Date.parse(instrument.listedAt)) / 86_400_000,
          ),
    last,
    change24hPct: percentChange(last, ticker?.open24h ?? null),
    sinceListingPct:
      last !== null && first && first.open > 0
        ? ((last / first.open) - 1) * 100
        : null,
    return7dPct: sevenDayReturn,
    return30dPct: thirtyDayReturn,
    highSinceListing:
      bars.length > 0 ? Math.max(...bars.map((bar) => bar.high)) : null,
    lowSinceListing:
      bars.length > 0 ? Math.min(...bars.map((bar) => bar.low)) : null,
    maxLeverage: instrument.maxLeverage,
    estimatedShares: company?.estimatedShares ?? null,
    impliedValuationUsd:
      company && last !== null ? last * company.estimatedShares : null,
    valuationSource: company?.valuationSource ?? null,
    openInterestUsd: snapshot.openInterest[instrument.instId]?.oiUsd ?? null,
    fundingRate: snapshot.funding[instrument.instId]?.fundingRate ?? null,
    vol24hUsd: ticker?.vol24hUsd ?? 0,
    orderbook: orderBookStats(book),
    weekly:
      weekly.score === null
        ? null
        : {
            score: weekly.score,
            signal: weekly.signal,
            pUp: weekly.pUp,
            confidence: weekly.confidence,
          },
  };
}

export async function buildPreIpo(
  snapshot: MarketSnapshot,
  symbol?: string,
  fetchBook?: (instId: string) => Promise<OrderBook | null>,
) {
  const contracts = symbol
    ? [resolveSymbol(symbol, snapshot)!.instrument]
    : snapshot.perps.filter((instrument) => instrument.preIpo);
  const data = await Promise.all(
    contracts.map((instrument) =>
      buildPreIpoContract(snapshot, instrument, fetchBook),
    ),
  );
  return {
    generatedAt: new Date().toISOString(),
    dataAsOf: snapshot.tickersRefreshedAt,
    universeSize: contracts.length,
    contracts: data,
    rules: PRE_IPO_RULES,
    disclaimer: DISCLAIMER,
  };
}

function oiChangePct(positioning: Positioning, h: HorizonDays) {
  const newest = positioning.oiHistory[0];
  const earlier = positioning.oiHistory[h];
  if (!newest || !earlier || earlier[3] === 0) return null;
  return ((newest[3] / earlier[3]) - 1) * 100;
}

function takerBuyRatio(positioning: Positioning, h: HorizonDays) {
  const rows = positioning.takerVolume.slice(0, h);
  if (rows.length === 0) return null;
  const buy = rows.reduce((sum, row) => sum + row[2], 0);
  const total = buy + rows.reduce((sum, row) => sum + row[1], 0);
  return total > 0 ? buy / total : null;
}

function positioningBias(
  signal: Signal | null,
  returnPct: number | null,
  oiChange: number | null,
  takerRatio: number | null,
) {
  if (signal === null || signal === "neutral") return "neutral";
  const direction = signal === "bullish" ? 1 : -1;
  if (
    oiChange !== null &&
    oiChange > 0 &&
    returnPct !== null &&
    Math.sign(returnPct) === direction &&
    takerRatio !== null &&
    (direction > 0 ? takerRatio > 0.5 : takerRatio < 0.5)
  ) {
    return "confirms";
  }
  if (
    oiChange !== null &&
    oiChange < 0 &&
    takerRatio !== null &&
    (direction > 0 ? takerRatio < 0.5 : takerRatio > 0.5)
  ) {
    return "diverges";
  }
  return "mixed";
}

export async function buildSignal(
  snapshot: MarketSnapshot,
  symbol: string,
  period: Period,
  getPositioning: (instId: string) => Promise<Positioning>,
  fetchBook?: (instId: string) => Promise<OrderBook | null>,
) {
  const resolved = resolveSymbol(symbol, snapshot);
  if (!resolved) throw new Error(`unknown symbol: ${symbol}`);
  const { instrument, market } = resolved;
  const bars = seriesFor(snapshot, instrument);
  const ticker = tickerFor(snapshot, instrument);
  const last = ticker?.last ?? bars.at(-1)?.close ?? null;
  const h = horizonDays(period);
  const primary = horizonBlock(snapshot, instrument, market, h);
  const horizons = {
    daily: horizonBlock(snapshot, instrument, market, 1),
    weekly: horizonBlock(snapshot, instrument, market, 7),
    monthly: horizonBlock(snapshot, instrument, market, 30),
  };
  const recent20 = bars.slice(-20);
  const recent365 = bars.slice(-365);
  const twentyRange = highLow(recent20);
  const allRange = highLow(recent365);
  const spotInstrument =
    market === "perp"
      ? linkedSpot(snapshot, instrument)
      : null;
  const spotTicker = spotInstrument ? tickerFor(snapshot, spotInstrument) : null;
  const index = snapshot.indices[`${instrument.symbol}-USDT`];
  const position =
    market === "perp" ? await getPositioning(instrument.instId) : null;
  const oiChange = position ? oiChangePct(position, h) : null;
  const takerRatio = position ? takerBuyRatio(position, h) : null;
  const bias = position
    ? positioningBias(
        primary.signal,
        primary.returnPct,
        oiChange,
        takerRatio,
      )
    : null;
  const fundingRate = position?.fundingRate ?? null;
  const publicBlock = (block: ReturnType<typeof horizonBlock>) => {
    const { features: _features, ...publicFields } = block;
    return publicFields;
  };

  return {
    symbol: instrument.symbol,
    instId: instrument.instId,
    market,
    preIpo: instrument.preIpo,
    name: instrument.preIpo
      ? (PRE_IPO_COMPANIES[instrument.symbol]?.company ?? null)
      : null,
    generatedAt: new Date().toISOString(),
    usMarket: isNyseOpen(new Date()),
    price: {
      last,
      bid: ticker?.bid ?? null,
      ask: ticker?.ask ?? null,
      spreadBps:
        ticker?.bid !== null &&
        ticker?.bid !== undefined &&
        ticker.ask !== null &&
        ticker.ask !== undefined &&
        (ticker.ask + ticker.bid) / 2 > 0
          ? ((ticker.ask - ticker.bid) / ((ticker.ask + ticker.bid) / 2)) *
            10_000
          : null,
      open24h: ticker?.open24h ?? null,
      high24h: ticker?.high24h ?? null,
      low24h: ticker?.low24h ?? null,
      change24hPct: percentChange(last, ticker?.open24h ?? null),
      vol24hUsd: ticker?.vol24hUsd ?? 0,
    },
    primary: publicBlock(primary),
    horizons: {
      daily: publicBlock(horizons.daily),
      weekly: publicBlock(horizons.weekly),
      monthly: publicBlock(horizons.monthly),
    },
    technicals: {
      rsi14: primary.features?.rsi14 ?? null,
      sma20: primary.features?.sma20 ?? null,
      sma50: primary.features?.sma50 ?? null,
      volatilityDailyPct: primary.features?.volatilityDailyPct ?? null,
      trend: primary.features?.trend ?? null,
      volumeRatio:
        horizons.weekly.features?.volumeRatio ?? null,
    },
    levels: {
      support20: twentyRange.low,
      resistance20: twentyRange.high,
      rangeHigh: allRange.high,
      rangeLow: allRange.low,
      barsAvailable: bars.length,
      listedAt: instrument.listedAt,
    },
    ...(position
      ? {
          positioning: {
            fundingRate,
            nextFundingTime: toIso(position.nextFundingTime),
            openInterestUsd: position.openInterestUsd,
            oiChangePct: oiChange,
            longShortAccountRatio: position.longShortAccountRatio,
            takerBuyRatio: takerRatio,
            crowding:
              fundingRate !== null && fundingRate > 0.0005
                ? "longs crowded"
                : fundingRate !== null && fundingRate < -0.0005
                  ? "shorts crowded"
                  : null,
            bias,
          },
        }
      : {}),
    ...(spotInstrument
      ? {
          spot: {
            instId: spotInstrument.instId,
            last: spotTicker?.last ?? null,
            basisPct:
              last !== null && spotTicker
                ? percentChange(last, spotTicker.last)
                : null,
          },
        }
      : {}),
    ...(index
      ? {
          index: {
            idxPx: index.idxPx,
            premiumPct: last === null ? null : percentChange(last, index.idxPx),
          },
        }
      : {}),
    ...(instrument.preIpo
      ? {
          preIpo: await buildPreIpoContract(snapshot, instrument, fetchBook),
        }
      : {}),
    disclaimer: DISCLAIMER,
  };
}

export function buildUniverse(snapshot: MarketSnapshot) {
  return {
    counts: {
      perps: snapshot.perps.length,
      spots: snapshot.spots.length,
      preIpo: snapshot.perps.filter((instrument) => instrument.preIpo).length,
    },
    perps: snapshot.perps.map((instrument) => ({
      symbol: instrument.symbol,
      instId: instrument.instId,
      preIpo: instrument.preIpo,
      maxLeverage: instrument.maxLeverage,
      listedAt: instrument.listedAt,
      spotInstId: linkedSpot(snapshot, instrument)?.instId ?? null,
    })),
    spots: snapshot.spots.map((instrument) => ({
      symbol: instrument.symbol,
      instId: instrument.instId,
      perpSymbol: linkedPerp(snapshot, instrument)?.symbol ?? null,
    })),
    updatedAt: snapshot.updatedAt,
  };
}

export async function buildPreview(
  snapshot: MarketSnapshot,
  now = new Date(),
) {
  const runnerInput = (period: Period) => ({
    period,
    market: "perp" as const,
    direction: "up" as const,
    limit: 5,
    minVolumeUsd: 100_000,
  });
  const [daily, weekly, monthly] = (
    ["daily", "weekly", "monthly"] as Period[]
  ).map((period) => buildRunners(snapshot, runnerInput(period), now.toISOString()));
  const preIpo = snapshot.perps
    .filter((instrument) => instrument.preIpo)
    .map((instrument) => {
      const ticker = tickerFor(snapshot, instrument);
      const company = PRE_IPO_COMPANIES[instrument.symbol] ?? null;
      return {
        symbol: instrument.symbol,
        company: company?.company ?? null,
        last: ticker?.last ?? null,
        change24hPct: percentChange(
          ticker?.last ?? null,
          ticker?.open24h ?? null,
        ),
        impliedValuationUsd:
          company && ticker ? ticker.last * company.estimatedShares : null,
        closes: closesFor(snapshot, instrument.instId),
      };
    });
  return {
    updatedAt: snapshot.updatedAt,
    usMarket: isNyseOpen(now),
    runners: {
      daily: daily.runners.map((row) => previewRunner(snapshot, row)),
      weekly: weekly.runners.map((row) => previewRunner(snapshot, row)),
      monthly: monthly.runners.map((row) => previewRunner(snapshot, row)),
    },
    preIpo,
    model: {
      name: "ultrax-momentum-v1",
      calibration: {
        daily: compactCalibration(getCalibration(snapshot, "perp", 1)),
        weekly: compactCalibration(getCalibration(snapshot, "perp", 7)),
        monthly: compactCalibration(getCalibration(snapshot, "perp", 30)),
      },
    },
  };
}

function closesFor(snapshot: MarketSnapshot, instId: string): number[] {
  return (snapshot.series[instId] ?? []).slice(-30).map((bar) => bar.close);
}

function previewRunner(snapshot: MarketSnapshot, row: Record<string, unknown>) {
  return {
    symbol: row.symbol,
    last: row.last,
    returnPct: row.returnPct,
    preIpo: row.preIpo,
    closes: closesFor(snapshot, row.instId as string),
  };
}

function compactCalibration(calibration: Calibration) {
  return {
    hitRate: calibration.hitRate,
    samples: calibration.samples,
    baseUpRate: calibration.baseUpRate,
  };
}
