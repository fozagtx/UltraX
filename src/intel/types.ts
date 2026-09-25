export type MarketType = "perp" | "spot";
export type Period = "daily" | "weekly" | "monthly";
export type HorizonDays = 1 | 7 | 30;
export type Signal = "bullish" | "bearish" | "neutral";
export type Confidence = "low" | "medium" | "high";

export interface Instrument {
  symbol: string;
  instId: string;
  market: MarketType;
  preIpo: boolean;
  maxLeverage: number | null;
  listedAt: string | null;
  baseCcy: string;
}

export interface Bar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  confirmed: boolean;
}

export interface Ticker {
  instId: string;
  last: number;
  bid: number | null;
  ask: number | null;
  open24h: number | null;
  high24h: number | null;
  low24h: number | null;
  vol24hUsd: number;
  ts: number;
}

export interface IndexPrice {
  idxPx: number;
  ts: number;
}

export interface Funding {
  fundingRate: number | null;
  nextFundingTime: number | null;
}

export interface OpenInterest {
  oiUsd: number | null;
  ts: number;
}

export interface CalibrationBucket {
  n: number;
  up: number;
  pUp: number;
  avgFwdReturnPct: number;
}

export type CalibrationBucketName =
  | "strong_bear"
  | "bear"
  | "neutral"
  | "bull"
  | "strong_bull";

export interface Calibration {
  buckets: Record<CalibrationBucketName, CalibrationBucket>;
  samples: number;
  baseUpRate: number | null;
  directionalSamples: number;
  hitRate: number | null;
}

export interface RubikPositioning {
  oiHistory: [number, number, number, number][];
  longShortAccountRatio: number | null;
  takerVolume: [number, number, number][];
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
  ts: number;
}

export interface MarketSnapshot {
  perps: Instrument[];
  spots: Instrument[];
  tickers: Record<string, Ticker>;
  indices: Record<string, IndexPrice>;
  funding: Record<string, Funding>;
  openInterest: Record<string, OpenInterest>;
  series: Record<string, Bar[]>;
  calibrations: Record<MarketType, Record<number, Calibration>>;
  books?: Record<string, OrderBook>;
  updatedAt: string;
  candlesRefreshedAt: string | null;
  tickersRefreshedAt: string | null;
}

export interface UniverseStatus {
  ready: boolean;
  perps: number;
  spots: number;
  preIpo: number;
  candlesRefreshedAt: string | null;
  tickersRefreshedAt: string | null;
}

export interface Positioning {
  fundingRate: number | null;
  nextFundingTime: number | null;
  openInterestUsd: number | null;
  oiHistory: [number, number, number, number][];
  longShortAccountRatio: number | null;
  takerVolume: [number, number, number][];
}

export interface UniverseProvider {
  snapshot(): MarketSnapshot | null;
  positioning(instId: string): Promise<Positioning>;
  orderBook?(instId: string): Promise<OrderBook | null>;
  status?(): UniverseStatus;
}

export function horizonDays(period: Period): HorizonDays {
  if (period === "daily") return 1;
  if (period === "weekly") return 7;
  return 30;
}
