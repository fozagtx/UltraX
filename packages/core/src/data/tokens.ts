export const CHAIN_ID = 196;
export const CHAIN_INDEX = "196";

export const USDT0_ADDRESS =
  "0x779ded0c9e1022225f8e0630b35a9b54be713736" as const;
export const USDT0_DECIMALS = 6;

export const EXPLORER_BASE = "https://www.okx.com/web3/explorer/xlayer";

export const RESTRICTED = ["US", "EU", "CA", "UK", "AU"] as const;

export const PRICE_USD = "0.005";
export const DISCLAIMER = "Information only, not investment advice.";

export interface XStockToken {
  ticker: string;
  /** ERC-4626 wrapper address on X Layer */
  wrapper: `0x${string}`;
  /** raw (unwrapped) xStock token address */
  raw: `0x${string}`;
  /** OKX exchange instrument id */
  okxInstId: string;
  /** RedStone data feed id for the underlying stock */
  redstoneId: string;
  /** populated at runtime from on-chain decimals() */
  decimals?: number;
}

export const XSTOCKS: readonly XStockToken[] = [
  {
    ticker: "NVDAx",
    wrapper: "0xa8ddb5cd96b5222afe198316e9a57caa642850d5",
    raw: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d",
    okxInstId: "XNVDA-USDT",
    redstoneId: "NVDA",
  },
  {
    ticker: "TSLAx",
    wrapper: "0xc3fdbe3a68ee5de461d30415a8165cf9aefe1171",
    raw: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0",
    okxInstId: "XTSLA-USDT",
    redstoneId: "TSLA",
  },
  {
    ticker: "AAPLx",
    wrapper: "0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f",
    raw: "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a",
    okxInstId: "XAAPL-USDT",
    redstoneId: "AAPL",
  },
];

export function getToken(ticker: string): XStockToken | undefined {
  return XSTOCKS.find((t) => t.ticker.toLowerCase() === ticker.toLowerCase());
}
