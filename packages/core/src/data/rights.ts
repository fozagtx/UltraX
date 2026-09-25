import { RESTRICTED } from "./tokens.js";

export interface TokenRights {
  type: string;
  voting: boolean;
  dividends: string;
  redemption: string;
  restricted: readonly string[];
}

const BASE_RIGHTS: TokenRights = {
  type: "Tracker certificate, 1:1 backed",
  voting: false,
  dividends: "Reinvested through the token multiplier",
  redemption: "Eligible holders only, US business days",
  restricted: RESTRICTED,
};

export const RIGHTS: Record<string, TokenRights> = {
  NVDAx: { ...BASE_RIGHTS },
  TSLAx: { ...BASE_RIGHTS },
  AAPLx: { ...BASE_RIGHTS },
};

export function getRights(ticker: string): TokenRights {
  return RIGHTS[ticker] ?? BASE_RIGHTS;
}
