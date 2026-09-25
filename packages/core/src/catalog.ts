import {
  CHAIN_ID,
  DISCLAIMER,
  EXPLORER_BASE,
  PRICE_USD,
  RESTRICTED,
  USDT0_ADDRESS,
  XSTOCKS,
} from "./data/tokens.js";
import { RIGHTS } from "./data/rights.js";

export const INPUT_REQUIRED = {
  status: "input_required",
  endpoint: "POST /check",
  required: {
    ticker: { type: "string", enum: XSTOCKS.map((t) => t.ticker) },
    side: { type: "string", enum: ["buy", "sell"] },
    sizeUSD: { type: "number", min: 0, max: 1_000_000, exclusiveMin: true },
  },
  example: { ticker: "NVDAx", side: "sell", sizeUSD: 500 },
} as const;

export const VERDICT_RULES = [
  {
    verdict: "OK",
    condition:
      "Market open, token within 1% of the stock and OKX, exit returns >= 98% of size",
  },
  {
    verdict: "CAUTION",
    condition:
      "US market closed, gap 1-3% vs stock or OKX, or exit returns 90-98% of size",
  },
  {
    verdict: "STOP",
    condition:
      "A required source is missing or stale, gap > 3%, or exit returns < 90% of size",
  },
] as const;

export const SERVICE_NAME = "Know What You Hold";
export const SERVICE_ENDPOINT_NAME = "xStock Pre-Trade Check";

export function serviceDescription(baseUrl: string): string {
  return [
    `${SERVICE_NAME}: paid pre-trade safety check for tokenized stocks (xStocks) on X Layer.`,
    `POST ${baseUrl}/check returns one verdict (OK / CAUTION / STOP), reference prices from RedStone and OKX,`,
    `the X Layer token price, the token's redemption multiplier and the expected exit value for your size.`,
    `Price ${PRICE_USD} USDT per call over x402. ${DISCLAIMER}`,
  ].join("\n");
}

export function buildCatalog(publicBaseUrl: string, network: string) {
  const base = publicBaseUrl.replace(/\/$/, "");
  return {
    name: SERVICE_NAME,
    serviceName: SERVICE_ENDPOINT_NAME,
    network,
    chainId: CHAIN_ID,
    fee: PRICE_USD,
    asset: `USDT0 (${USDT0_ADDRESS})`,
    explorer: EXPLORER_BASE,
    serviceDescription: serviceDescription(base),
    inputRequired: INPUT_REQUIRED,
    tokens: XSTOCKS.map((t) => ({
      ticker: t.ticker,
      wrapper: t.wrapper,
      raw: t.raw,
      okxInstId: t.okxInstId,
      redstoneId: t.redstoneId,
    })),
    verdictRules: VERDICT_RULES,
    rights: RIGHTS,
    restricted: RESTRICTED,
    disclaimer: DISCLAIMER,
    endpoints: {
      free: ["GET /health", "GET /status", "GET /payments/recent", "GET /catalog"],
      paid: [`POST /check (${PRICE_USD} USDT)`],
    },
    curl: {
      check: `curl -s -X POST ${base}/check -H 'content-type: application/json' -d '{"ticker":"NVDAx","side":"sell","sizeUSD":500}'`,
    },
  };
}
