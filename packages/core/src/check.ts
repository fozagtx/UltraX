import { getRights } from "./data/rights.js";
import {
  CHAIN_ID,
  CHAIN_INDEX,
  DISCLAIMER,
  getToken,
  PRICE_USD,
  RESTRICTED,
  USDT0_ADDRESS,
  USDT0_DECIMALS,
  type XStockToken,
} from "./data/tokens.js";
import { exitPct as computeExitPct, gapPct } from "./rules/formulas.js";
import { isNyseOpen, type MarketState } from "./rules/marketHours.js";
import { decide, type Verdict } from "./rules/verdict.js";

export type CheckSide = "buy" | "sell";

export interface CheckRequest {
  ticker: string;
  side: CheckSide;
  sizeUSD: number;
}

export interface StockPriceResult {
  price: number;
  asOf: number;
}
export interface TickerResult {
  last: number;
  ts: number;
}
export interface XLayerPriceResult {
  price: number;
  time: number;
}
export interface DexQuoteResult {
  toTokenAmount: bigint;
  priceImpactPct: number | null;
  toDecimals: number;
}

export interface CheckDeps {
  now?: Date;
  marketState?: (d: Date) => MarketState;
  stockPrice: (dataFeedId: string) => Promise<StockPriceResult>;
  okxTicker: (instId: string) => Promise<TickerResult>;
  xlayerPrice: (wrapper: string) => Promise<XLayerPriceResult>;
  multiplier: (wrapper: string) => Promise<number>;
  tokenDecimals: (wrapper: string) => Promise<number>;
  dexQuote: (opts: {
    from: string;
    to: string;
    amount: string;
  }) => Promise<DexQuoteResult>;
}

const STALE_MS = 10 * 60_000;
const SOURCE_TIMEOUT_MS = 8_000;

function round(n: number | null, dp: number): number | null {
  if (n === null) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_r, rej) => {
    t = setTimeout(() => rej(new Error("source timeout")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t!);
  }
}

export interface CheckResponse {
  verdict: Verdict;
  reasons: string[];
  price: {
    realStock: number | null;
    okxExchange: number | null;
    multiplier: number | null;
    xlayerToken: number | null;
    gapVsStockPct: number | null;
    gapVsOkxPct: number | null;
    marketOpen: boolean;
    stockPriceAsOf: string | null;
  };
  exit: {
    sizeUSD: number;
    expectedUSD: number | null;
    priceImpactPct: number | null;
  };
  rights: ReturnType<typeof getRights>;
  payment: {
    network: string;
    asset: string;
    priceUsd: number;
    txHash: null;
    note: string;
  };
  restricted: readonly string[];
  disclaimer: string;
  sources: {
    realStock: string;
    okxExchange: string | null;
    xlayerToken: string;
    exit: string;
    multiplier: string;
  };
  checkedAt: string;
}

export async function runCheck(
  deps: CheckDeps,
  req: CheckRequest,
): Promise<CheckResponse> {
  const token = getToken(req.ticker);
  if (!token) throw new Error(`unknown ticker: ${req.ticker}`);

  const now = deps.now ?? new Date();
  const market = (deps.marketState ?? isNyseOpen)(now);
  const marketOpen = market.open;

  // Phase 1: independent price sources in parallel, 8s each.
  const [stockR, tickerR, xlayerR, multR] = await Promise.allSettled([
    withTimeout(deps.stockPrice(token.redstoneId), SOURCE_TIMEOUT_MS),
    withTimeout(deps.okxTicker(token.okxInstId), SOURCE_TIMEOUT_MS),
    withTimeout(deps.xlayerPrice(token.wrapper), SOURCE_TIMEOUT_MS),
    withTimeout(deps.multiplier(token.wrapper), SOURCE_TIMEOUT_MS),
  ]);

  const missing: string[] = [];
  const stale: string[] = [];

  let realStock: number | null = null;
  let stockAsOf: number | null = null;
  if (stockR.status === "fulfilled") {
    realStock = stockR.value.price;
    stockAsOf = stockR.value.asOf;
    if (marketOpen && now.getTime() - stockAsOf > STALE_MS) {
      stale.push("realStock");
    }
  } else {
    missing.push("realStock");
  }

  // okxExchange is optional: absence just drops that gap.
  let okxExchange: number | null = null;
  let okxSource: string | null = "okx-ticker";
  if (tickerR.status === "fulfilled") {
    if (marketOpen && now.getTime() - tickerR.value.ts > STALE_MS) {
      okxSource = null; // stale while market open -> ignore
    } else {
      okxExchange = tickerR.value.last;
    }
  } else {
    okxSource = null;
  }

  let xlayerToken: number | null = null;
  if (xlayerR.status === "fulfilled") {
    xlayerToken = xlayerR.value.price;
  } else {
    missing.push("xlayerToken");
  }

  let multiplier: number | null = null;
  if (multR.status === "fulfilled") {
    multiplier = multR.value;
  } else {
    missing.push("multiplier");
  }

  // Phase 2: DEX quote for the exit leg.
  let expectedUSD: number | null = null;
  let priceImpactPct: number | null = null;
  let dec: number | null = null;
  try {
    dec = await withTimeout(
      deps.tokenDecimals(token.wrapper),
      SOURCE_TIMEOUT_MS,
    );
  } catch {
    dec = null;
  }

  const canQuote =
    dec !== null &&
    (req.side === "sell" ? xlayerToken !== null : true);
  if (!canQuote) {
    missing.push("exit");
  } else {
    try {
      if (req.side === "sell") {
        const tokens = sizeToTokenAmount(req.sizeUSD, xlayerToken as number, dec as number);
        const q = await withTimeout(
          deps.dexQuote({
            from: token.wrapper,
            to: USDT0_ADDRESS,
            amount: tokens.toString(),
          }),
          SOURCE_TIMEOUT_MS,
        );
        expectedUSD = Number(q.toTokenAmount) / 10 ** USDT0_DECIMALS;
        priceImpactPct = q.priceImpactPct;
      } else {
        const q = await withTimeout(
          deps.dexQuote({
            from: USDT0_ADDRESS,
            to: token.wrapper,
            amount: usdToUsdt0(req.sizeUSD).toString(),
          }),
          SOURCE_TIMEOUT_MS,
        );
        const tokensOut = Number(q.toTokenAmount) / 10 ** (dec as number);
        if (realStock !== null && multiplier !== null) {
          expectedUSD = tokensOut * realStock * multiplier;
        }
        priceImpactPct = q.priceImpactPct;
      }
    } catch {
      missing.push("exit");
    }
  }

  const gapVsStockPct =
    xlayerToken !== null && realStock !== null && multiplier !== null
      ? gapPct(xlayerToken, realStock, multiplier)
      : null;
  const gapVsOkxPct =
    xlayerToken !== null && okxExchange !== null
      ? gapPct(xlayerToken, okxExchange, 1)
      : null;

  const exitPercent =
    expectedUSD !== null ? computeExitPct(expectedUSD, req.sizeUSD) : null;

  const { verdict, reasons } = decide({
    marketOpen,
    gapVsStockPct,
    gapVsOkxPct,
    exitPct: exitPercent,
    missing,
    stale,
  });

  return {
    verdict,
    reasons,
    price: {
      realStock: round(realStock, 4),
      okxExchange: round(okxExchange, 4),
      multiplier: round(multiplier, 4),
      xlayerToken: round(xlayerToken, 4),
      gapVsStockPct: round(gapVsStockPct, 2),
      gapVsOkxPct: round(gapVsOkxPct, 2),
      marketOpen,
      stockPriceAsOf: stockAsOf !== null ? new Date(stockAsOf).toISOString() : null,
    },
    exit: {
      sizeUSD: round(req.sizeUSD, 2) as number,
      expectedUSD: round(expectedUSD, 2),
      priceImpactPct: round(priceImpactPct, 2),
    },
    rights: getRights(token.ticker),
    payment: {
      network: `eip155:${CHAIN_ID}`,
      asset: "USDT0",
      priceUsd: Number(PRICE_USD),
      txHash: null,
      note: "Settlement tx hash is returned in the PAYMENT-RESPONSE header (x402 v2).",
    },
    restricted: RESTRICTED,
    disclaimer: DISCLAIMER,
    sources: {
      realStock: "redstone",
      okxExchange: okxSource,
      xlayerToken: "okx-market-price-info",
      exit: "okx-dex-quote",
      multiplier: "xlayer-rpc",
    },
    checkedAt: now.toISOString(),
  };
}

function sizeToTokenAmount(
  sizeUSD: number,
  tokenPriceUSD: number,
  decimals: number,
): bigint {
  const tokens = sizeUSD / tokenPriceUSD;
  return BigInt(Math.round(tokens * 10 ** decimals));
}

function usdToUsdt0(sizeUSD: number): bigint {
  return BigInt(Math.round(sizeUSD * 10 ** USDT0_DECIMALS));
}

export function validateCheckRequest(body: unknown):
  | { ok: true; value: CheckRequest }
  | { ok: false; error: string } {
  const b = body as Record<string, unknown> | null;
  const ticker = String(b?.ticker ?? "");
  const side = String(b?.side ?? "");
  const sizeUSD = Number(b?.sizeUSD);
  if (!getToken(ticker)) return { ok: false, error: `unknown ticker '${ticker}'` };
  if (side !== "buy" && side !== "sell")
    return { ok: false, error: `side must be 'buy' or 'sell'` };
  if (!Number.isFinite(sizeUSD) || sizeUSD <= 0 || sizeUSD > 1_000_000)
    return { ok: false, error: "sizeUSD must be > 0 and <= 1000000" };
  return { ok: true, value: { ticker, side: side as CheckSide, sizeUSD } };
}

export const CHECK_INPUT_FIELDS = ["ticker", "side", "sizeUSD"] as const;
export const CHAIN_INDEX_STR = CHAIN_INDEX;
export type { XStockToken };
