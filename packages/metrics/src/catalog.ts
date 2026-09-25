export const CHAIN_ID = 196;
export const TESTNET_CHAIN_ID = 1952;
export const USDT0_ADDRESS = "0x779ded0c9e1022225f8e0630b35a9b54be713736";
export const USDT0_DECIMALS = 6;
export const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const EXPLORER_BASE = "https://www.okx.com/web3/explorer/xlayer";
export const WHALE_MIN_USD = 100000;

export interface MetricParam {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  constraints?: string;
  description: string;
}

export interface MetricDef {
  id: string;
  name: string;
  description: string;
  unit: string;
  method: "GET" | "POST";
  priceUsd: number;
  params: MetricParam[];
  path: string;
  okxSource: string;
  computeNote: string;
}

const daysParam: MetricParam = {
  name: "days",
  type: "integer",
  required: false,
  default: 7,
  constraints: "1-30",
  description: "Number of trailing UTC days to return (missing days are omitted)",
};

export const METRIC_CATALOG: MetricDef[] = [
  {
    id: "new-addresses",
    name: "New Addresses",
    description: "Daily count of newly active addresses on X Layer",
    unit: "addresses",
    method: "GET",
    priceUsd: 0.01,
    params: [daysParam],
    path: "/v1/metrics/new-addresses",
    okxSource: "GET /api/v6/explorer/info/stats",
    computeNote: "Direct from OKX stats history; backfilled via block scan when unsupported",
  },
  {
    id: "tx-count",
    name: "Transaction Count",
    description: "Daily transaction count and contract call count on X Layer",
    unit: "transactions",
    method: "GET",
    priceUsd: 0.01,
    params: [daysParam],
    path: "/v1/metrics/tx-count",
    okxSource: "GET /api/v6/explorer/info/stats",
    computeNote: "value = total transactions; extra field contractCalls",
  },
  {
    id: "fees",
    name: "Transaction Fees",
    description: "Daily total transaction fees in OKB and USD plus network utilization",
    unit: "OKB",
    method: "GET",
    priceUsd: 0.01,
    params: [daysParam],
    path: "/v1/metrics/fees",
    okxSource: "GET /api/v6/explorer/info/stats",
    computeNote: "fee_usd = fee_okb * cached OKB/USD price; extra fields feeUsd, utilization",
  },
  {
    id: "stablecoin-volume",
    name: "Stablecoin Volume",
    description: "Daily USDT0 transfer volume in USD on X Layer",
    unit: "USD",
    method: "GET",
    priceUsd: 0.01,
    params: [daysParam],
    path: "/v1/metrics/stablecoin-volume",
    okxSource: "GET /api/v6/explorer/log/by-address-and-topic",
    computeNote: "Aggregated from decoded USDT0 Transfer events collected by the indexer",
  },
  {
    id: "stablecoin-netflow",
    name: "Stablecoin Netflow",
    description: "Daily USDT0 netflow (mints minus burns) in USD on X Layer",
    unit: "USD",
    method: "GET",
    priceUsd: 0.01,
    params: [daysParam],
    path: "/v1/metrics/stablecoin-netflow",
    okxSource: "GET /api/v6/explorer/log/by-address-and-topic",
    computeNote: "mint = transfers from zero address; burn = transfers to zero address; signed value",
  },
  {
    id: "whale-transfers",
    name: "Whale Transfers",
    description: "Largest recent USDT0 transfers on X Layer, newest first",
    unit: "USD",
    method: "GET",
    priceUsd: 0.01,
    params: [
      {
        name: "minUsd",
        type: "number",
        required: false,
        default: WHALE_MIN_USD,
        constraints: ">=0",
        description: "Minimum transfer size in USD",
      },
      {
        name: "limit",
        type: "integer",
        required: false,
        default: 20,
        constraints: "1-50",
        description: "Maximum number of transfers to return",
      },
    ],
    path: "/v1/metrics/whale-transfers",
    okxSource: "GET /api/v6/explorer/log/by-address-and-topic",
    computeNote: "Served from indexed USDT0 Transfer events",
  },
  {
    id: "holder-concentration",
    name: "Holder Concentration",
    description: "Top holder concentration percentages for a token on X Layer",
    unit: "percent",
    method: "GET",
    priceUsd: 0.02,
    params: [
      {
        name: "token",
        type: "address",
        required: true,
        constraints: "0x-prefixed 40-hex address",
        description: "Token contract address (e.g. USDT0)",
      },
    ],
    path: "/v1/metrics/holder-concentration",
    okxSource: "GET /api/v6/dex/market/token/cluster/top-holders",
    computeNote: "Cached 1h; falls back to the token/holder endpoint when cluster data is unavailable",
  },
];

export interface ExtraEndpoint {
  id: string;
  name: string;
  description: string;
  unit: string;
  method: "GET" | "POST";
  priceUsd: number;
  params: MetricParam[];
  path: string;
  okxSource: string;
  computeNote: string;
}

export const EXTRA_ENDPOINTS: ExtraEndpoint[] = [
  {
    id: "snapshot",
    name: "Snapshot",
    description: "Latest value and 7-day change for every metric in one call",
    unit: "mixed",
    method: "GET",
    priceUsd: 0.05,
    params: [],
    path: "/v1/snapshot",
    okxSource: "aggregated",
    computeNote: "Combines latest rows of all series metrics plus latest whale transfer and cached holder concentration",
  },
  {
    id: "alerts-subscribe",
    name: "Whale Alert Subscription",
    description: "Register a webhook that receives whale-transfers events for 30 days",
    unit: "subscription",
    method: "POST",
    priceUsd: 0.1,
    params: [
      {
        name: "webhookUrl",
        type: "url",
        required: true,
        constraints: "https only",
        description: "HTTPS endpoint that receives POST JSON events",
      },
      {
        name: "minUsd",
        type: "number",
        required: true,
        constraints: ">=100000",
        description: "Minimum transfer size in USD that triggers delivery",
      },
      {
        name: "days",
        type: "integer",
        required: false,
        default: 30,
        constraints: "1-30",
        description: "Subscription lifetime in days",
      },
    ],
    path: "/v1/alerts/subscribe",
    okxSource: "n/a",
    computeNote: "Events dispatched by the collector after each log sync",
  },
];

export const ALL_ENDPOINTS = [...METRIC_CATALOG, ...EXTRA_ENDPOINTS];

export const WHALE_ALERT_EVENT_SHAPE = {
  metric: "whale-transfers",
  txHash: "0x...",
  token: "USDT0",
  from: "0x...",
  to: "0x...",
  amountUsd: 0,
  timestamp: "ISO-8601",
  chainId: CHAIN_ID,
  explorerUrl: `${EXPLORER_BASE}/tx/0x...`,
} as const;
