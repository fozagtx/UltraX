import {
  getSignersForDataServiceId,
  verifyAndComputeMedian,
} from "@redstone-finance/sdk";
import type { SignedDataPackagePlainObj } from "@redstone-finance/protocol";

export interface StockPrice {
  price: number;
  asOf: number; // ms epoch, earliest package timestamp
}

const DATA_SERVICE_ID = "redstone-primary-prod";
// Public RedStone gateways. The authenticated gateway requires an API key;
// these serve the same signed packages, which we verify ourselves.
const GATEWAYS = [
  "https://oracle-gateway-1.a.redstone.finance",
  "https://oracle-gateway-2.a.redstone.finance",
];

type PackagesMap = Record<string, SignedDataPackagePlainObj[] | undefined>;

async function fetchPackages(signal?: AbortSignal): Promise<PackagesMap> {
  let lastErr: unknown;
  for (const gw of GATEWAYS) {
    try {
      const res = await fetch(
        `${gw}/data-packages/latest/${DATA_SERVICE_ID}`,
        { signal: signal ?? AbortSignal.timeout(8_000) },
      );
      if (!res.ok) {
        lastErr = new Error(`redstone gateway HTTP ${res.status}`);
        continue;
      }
      return (await res.json()) as PackagesMap;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

let cache: { at: number; data: PackagesMap } | null = null;
const CACHE_MS = 30_000;

export async function getStockPrice(
  dataFeedId: string,
  opts?: { signal?: AbortSignal },
): Promise<StockPrice> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    cache = { at: Date.now(), data: await fetchPackages(opts?.signal) };
  }
  const pkgs = cache.data[dataFeedId];
  if (!pkgs || pkgs.length === 0) {
    throw new Error(`redstone: no packages for ${dataFeedId}`);
  }
  const signers = getSignersForDataServiceId(DATA_SERVICE_ID);
  const price = verifyAndComputeMedian(pkgs, signers);
  const asOf = Math.min(...pkgs.map((p) => p.timestampMilliseconds));
  return { price, asOf };
}
