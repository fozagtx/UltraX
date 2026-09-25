export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

export interface Health {
  status: string;
  chainId: number;
  network: string;
  payTo: string;
  okxConfigured: boolean;
  marketOpen: boolean;
  uptime: number;
}

export interface StatusToken {
  ticker: string;
  realStock: number | null;
  stockPriceAsOf: string | null;
  okxExchange: number | null;
  okxTs: string | null;
  multiplier: number | null;
}

export interface Status {
  marketOpen: boolean;
  marketReason: string;
  nextChange: string | null;
  tokens: StatusToken[];
  updatedAt: string;
}

export interface CatalogToken {
  ticker: string;
  wrapper: string;
  raw: string;
  okxInstId: string;
  redstoneId: string;
}

export interface Catalog {
  name: string;
  serviceName: string;
  network: string;
  chainId: number;
  fee: string;
  asset: string;
  explorer: string;
  serviceDescription: string;
  inputRequired: { example: { ticker: string; side: string; sizeUSD: number } };
  tokens: CatalogToken[];
  verdictRules: { verdict: string; condition: string }[];
  rights: Record<string, { type: string; voting: boolean; dividends: string; redemption: string; restricted: string[] }>;
  restricted: string[];
  disclaimer: string;
  endpoints: { free: string[]; paid: string[] };
}

export interface Payment {
  txHash: string;
  from: string;
  amountUsd: number;
  timestamp: number;
  blockNumber: number;
}

export interface Payments {
  payTo: string;
  count24h: number;
  totalUsd24h: number;
  warming: boolean;
  scannedFrom: number | null;
  lastScanned: number | null;
  payments: Payment[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const fetchHealth = () => get<Health>("/health");
export const fetchStatus = () => get<Status>("/status");
export const fetchCatalog = () => get<Catalog>("/catalog");
export const fetchPayments = () => get<Payments>("/payments/recent?limit=10");
