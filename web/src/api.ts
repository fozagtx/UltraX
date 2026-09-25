export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

export type Period = "daily" | "weekly" | "monthly";

export interface Health {
  status: string;
  service: string;
  network: string;
  payTo: string;
  paymentsConfigured: boolean;
  universe: {
    ready: boolean;
    perps: number;
    spots: number;
    preIpo: number;
    candlesRefreshedAt: string | null;
    tickersRefreshedAt: string | null;
  };
  usMarketOpen: boolean;
  uptime: number;
}

export interface PreviewRunner {
  symbol: string;
  last: number;
  returnPct: number;
  preIpo: boolean;
  closes: number[];
}

export interface PreviewPreIpo {
  symbol: string;
  company: string | null;
  last: number | null;
  change24hPct: number | null;
  impliedValuationUsd: number | null;
  closes: number[];
}

export interface CalibrationSummary {
  hitRate: number | null;
  samples: number;
  baseUpRate: number | null;
}

export interface Preview {
  updatedAt: string;
  usMarket: { open: boolean; reason: string; nextChange: string | null };
  runners: Record<Period, PreviewRunner[]>;
  preIpo: PreviewPreIpo[];
  model: { name: string; calibration: Partial<Record<Period, CalibrationSummary>> };
}

export interface CatalogEndpoint {
  method: string;
  path: string;
  priceUsd: number;
  description: string;
}

export interface Catalog {
  name: string;
  tagline: string;
  endpoints: { paid: CatalogEndpoint[]; free: string[] };
  disclaimer: string;
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
export const fetchPreview = () => get<Preview>("/preview");
export const fetchCatalog = () => get<Catalog>("/catalog");
export const fetchPayments = () => get<Payments>("/payments/recent?limit=10");
