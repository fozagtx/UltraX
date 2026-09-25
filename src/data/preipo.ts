export interface PreIpoCompany {
  company: string;
  estimatedShares: number;
  valuationSource: string;
}

const spacexOpenAiAnthropicSource =
  "https://www.okx.com/help/okx-to-list-pre-ipo-pre-market-perpetual-futures-for-spacex-usdt-openai-usdt-and-anthropic-usdt";

export const PRE_IPO_COMPANIES: Record<string, PreIpoCompany> = {
  OPENAI: {
    company: "OpenAI",
    estimatedShares: 1_000_000_000,
    valuationSource: spacexOpenAiAnthropicSource,
  },
  ANTHROPIC: {
    company: "Anthropic",
    estimatedShares: 1_000_000_000,
    valuationSource: spacexOpenAiAnthropicSource,
  },
  MOONSHOT: {
    company: "Moonshot AI",
    estimatedShares: 1_000_000_000,
    valuationSource:
      "https://www.okx.com/en-us/help/okx-to-list-pre-ipo-pre-market-perpetual-futures-for-moonshot-usdt",
  },
  OURA: {
    company: "Oura Inc.",
    estimatedShares: 320_945_459,
    valuationSource:
      "https://www.okx.com/en-us/help/okx-to-list-pre-ipo-pre-market-perpetual-futures-for-oura-usdt",
  },
};

export const PRE_IPO_RULES = [
  "Price = per-share price × share count ≈ market cap.",
  "Rebase on S-1 disclosure (value neutral).",
  "Converts to standard stock perp after IPO.",
  "Premium-index component of funding set to zero.",
  "Price bands capped.",
] as const;
