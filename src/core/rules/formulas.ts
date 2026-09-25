/** Percent gap of the token's on-chain price vs stock reference price x multiplier. */
export function gapPct(
  tokenPrice: number,
  refPrice: number,
  multiplier: number,
): number {
  const ref = refPrice * multiplier;
  return ((tokenPrice - ref) / ref) * 100;
}

/** Fraction of the requested size the exit is expected to return, in percent. */
export function exitPct(expectedUSD: number, sizeUSD: number): number {
  if (sizeUSD <= 0) return 0;
  return (expectedUSD / sizeUSD) * 100;
}
