export const API_BASE =
  process.env.API_BASE_URL ?? "http://localhost:8080";

export const PUBLIC_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface StatusToken {
  ticker: string;
  realStock: number | null;
  stockPriceAsOf: string | null;
  okxExchange: number | null;
  okxTs: string | null;
  multiplier: number | null;
}

export interface StatusResponse {
  marketOpen: boolean;
  marketReason: string;
  nextChange: string;
  tokens: StatusToken[];
  updatedAt: string;
}

export interface PaymentItem {
  txHash: string;
  from: string;
  amountUsd: number;
  blockNumber: number;
  timestamp: number;
  explorerUrl: string;
}

export interface PaymentsResponse {
  payTo: string;
  count24h: number;
  totalUsd24h: number;
  warming: boolean;
  scannedFrom: number | null;
  lastScanned: number | null;
  payments: PaymentItem[];
}

export interface CatalogResponse {
  name: string;
  serviceName: string;
  network: string;
  chainId: number;
  fee: string;
  asset: string;
  explorer: string;
  serviceDescription: string;
  inputRequired: {
    status: string;
    endpoint: string;
    required: Record<
      string,
      { type: string; enum?: string[]; min?: number; max?: number }
    >;
    example: { ticker: string; side: string; sizeUSD: number };
  };
  tokens: {
    ticker: string;
    wrapper: string;
    raw: string;
    okxInstId: string;
    redstoneId: string;
  }[];
  verdictRules: { verdict: string; condition: string }[];
  rights: Record<
    string,
    {
      type: string;
      voting: boolean;
      dividends: string;
      redemption: string;
      restricted: string[];
    }
  >;
  restricted: string[];
  disclaimer: string;
  endpoints: { free: string[]; paid: string[] };
  curl: { check: string };
}
