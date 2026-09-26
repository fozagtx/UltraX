import {
  CHAIN_ID,
  DISCLAIMER,
  PRICE_USD,
  USDT0_ADDRESS,
  USDT0_DECIMALS,
} from "./config.js";
import { INPUT_SCHEMAS } from "./intel/input.js";

const paidEndpoints = [
  {
    method: "POST",
    path: "/runners",
    priceUsd: PRICE_USD.runners,
    description: "Rank OKX stock perp or xStock spot runners by return.",
    input: { required: ["period"], optional: ["market", "direction", "limit", "minVolumeUsd"], schema: INPUT_SCHEMAS.runners },
    example: { period: "weekly", market: "perp", direction: "up", limit: 10 },
  },
  {
    method: "POST",
    path: "/signal",
    priceUsd: PRICE_USD.signal,
    description: "Return predictive signals, technicals, levels, and positioning for a stock.",
    input: { required: ["symbol"], optional: ["period"], schema: INPUT_SCHEMAS.signal },
    example: { symbol: "NVDA", period: "weekly" },
  },
  {
    method: "POST",
    path: "/preipo",
    priceUsd: PRICE_USD.preipo,
    description: "Return pre-IPO contract intelligence and estimated valuations.",
    input: { required: [], optional: ["symbol"], schema: INPUT_SCHEMAS.preipo },
    example: { symbol: "ANTHROPIC" },
  },
];

export function buildCatalog(
  publicBaseUrl: string,
  network: string,
  payTo: string,
) {
  return {
    name: "UltraX",
    tagline: "Market intelligence for everything stocks on OKX",
    endpoints: {
      paid: paidEndpoints,
      free: [
        "GET /health",
        "GET /catalog",
        "GET /universe",
        "GET /preview",
        "GET /payments/recent",
      ],
    },
    model: {
      name: "ultrax-momentum-v1",
      description:
        "Momentum z-score (50%), trend (25%), volume confirmation (15%), and RSI mean-reversion adjustment (10%), clipped to [-100, 100]. Horizons are 1, 7, and 30 calendar days.",
      calibrationBuckets: [
        { name: "strong_bear", condition: "score <= -50" },
        { name: "bear", condition: "-50 < score <= -25" },
        { name: "neutral", condition: "-25 < score < 25" },
        { name: "bull", condition: "25 <= score < 50" },
        { name: "strong_bull", condition: "score >= 50" },
      ],
      calibration: "Walk-forward, confirmed bars only, Laplace-smoothed pUp.",
    },
    dataSources: [
      { name: "OKX v5 public REST", baseUrl: "https://www.okx.com" },
      { name: "OKX Rubik public statistics", baseUrl: "https://www.okx.com" },
    ],
    payment: {
      network,
      chainId: CHAIN_ID,
      asset: {
        symbol: "USDT0",
        address: USDT0_ADDRESS,
        decimals: USDT0_DECIMALS,
      },
      payTo,
      pricesUsd: PRICE_USD,
    },
    apiBaseUrl: publicBaseUrl.replace(/\/$/, ""),
    disclaimer: DISCLAIMER,
  };
}
