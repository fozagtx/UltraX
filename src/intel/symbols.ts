import type { Instrument, MarketSnapshot, MarketType } from "./types.js";

export interface ResolvedSymbol {
  instrument: Instrument;
  market: MarketType;
}

export function resolveSymbol(
  input: string,
  snapshot: MarketSnapshot,
): ResolvedSymbol | null {
  let symbol = input.trim().toUpperCase();
  symbol = symbol.replace(/-USDT-SWAP$/, "").replace(/-USDT$/, "");

  const perp = snapshot.perps.find(
    (instrument) => instrument.symbol.toUpperCase() === symbol,
  );
  if (perp) return { instrument: perp, market: "perp" };

  if (symbol.endsWith("X")) {
    const tokenless = symbol.slice(0, -1);
    const matched = snapshot.perps.find(
      (instrument) => instrument.symbol.toUpperCase() === tokenless,
    );
    if (matched) return { instrument: matched, market: "perp" };
  }

  if (symbol.startsWith("X")) {
    const tokenless = symbol.slice(1);
    const matched = snapshot.perps.find(
      (instrument) => instrument.symbol.toUpperCase() === tokenless,
    );
    if (matched) return { instrument: matched, market: "perp" };
  }

  const spot = snapshot.spots.find(
    (instrument) =>
      instrument.symbol.toUpperCase() === symbol ||
      instrument.baseCcy.toUpperCase() === symbol,
  );
  if (spot) return { instrument: spot, market: "spot" };
  return null;
}
