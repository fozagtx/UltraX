import { CHAIN_INDEX } from "../data/tokens.js";
import type { OkxClient } from "./okxAuth.js";

export interface XLayerPrice {
  price: number;
  time: number; // ms epoch
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parsePriceInfo(data: unknown): XLayerPrice {
  const arr = Array.isArray(data) ? data : [];
  const first = arr[0] as Record<string, unknown> | undefined;
  const price = toNum(first?.price);
  const time = toNum(first?.time) ?? toNum(first?.timestamp) ?? 0;
  if (price === null || price <= 0) {
    throw new Error("okx price-info: no price in response");
  }
  return { price, time };
}

export async function getXLayerPrice(
  client: OkxClient,
  wrapper: string,
): Promise<XLayerPrice> {
  const data = await client.post<unknown>("/api/v6/dex/market/price-info", [
    { chainIndex: CHAIN_INDEX, tokenContractAddress: wrapper.toLowerCase() },
  ]);
  return parsePriceInfo(data);
}
