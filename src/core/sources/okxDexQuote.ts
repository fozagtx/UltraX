import { CHAIN_INDEX } from "../data/tokens.js";
import type { OkxClient } from "./okxAuth.js";

export interface DexQuote {
  toTokenAmount: bigint;
  priceImpactPct: number | null;
  toDecimals: number;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Fixture shape per OKX docs quick-start: data: [{ toTokenAmount,
// priceImpactPercent, toToken: { decimal, ... }, ... }]
export function parseDexQuote(data: unknown): DexQuote {
  const arr = Array.isArray(data) ? data : [];
  const first = arr[0] as Record<string, unknown> | undefined;
  if (!first) throw new Error("okx dex quote: empty data");
  const raw = first.toTokenAmount;
  const amount =
    raw === undefined || raw === null || raw === "" ? null : BigInt(String(raw));
  if (amount === null || amount <= 0n) {
    throw new Error("okx dex quote: no toTokenAmount");
  }
  const toToken = (first.toToken ?? {}) as Record<string, unknown>;
  const decimals =
    toNum(toToken.decimal) ?? toNum(toToken.decimals) ?? toNum(first.toDecimals);
  return {
    toTokenAmount: amount,
    priceImpactPct: toNum(first.priceImpactPercent),
    toDecimals: decimals ?? 0,
  };
}

export async function quote(
  client: OkxClient,
  opts: { from: string; to: string; amount: string },
): Promise<DexQuote> {
  const data = await client.get<unknown>("/api/v6/dex/aggregator/quote", {
    chainIndex: CHAIN_INDEX,
    fromTokenAddress: opts.from,
    toTokenAddress: opts.to,
    amount: opts.amount,
  });
  return parseDexQuote(data);
}
