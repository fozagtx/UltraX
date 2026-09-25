import type { MarketSnapshot, Period } from "./types.js";
import { resolveSymbol } from "./symbols.js";

export const INPUT_SCHEMAS = {
  runners: {
    period: { type: "string", enum: ["daily", "weekly", "monthly"] },
    market: { type: "string", enum: ["perp", "spot"], default: "perp" },
    direction: { type: "string", enum: ["up", "down"], default: "up" },
    limit: { type: "integer", min: 1, max: 50, default: 10 },
    minVolumeUsd: { type: "number", min: 0, default: 100000 },
  },
  signal: {
    symbol: { type: "string", required: true },
    period: {
      type: "string",
      enum: ["daily", "weekly", "monthly"],
      default: "weekly",
    },
  },
  preipo: {
    symbol: { type: "string", required: false },
  },
} as const;

export interface RunnerInput {
  period: Period;
  market: "perp" | "spot";
  direction: "up" | "down";
  limit: number;
  minVolumeUsd: number;
}

export interface SignalInput {
  symbol: string;
  period: Period;
}

type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }
  | { ok: false; missing: string[]; required: unknown };

function recordBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function unknownKeys(
  body: Record<string, unknown>,
  accepted: string[],
): string | null {
  const unknown = Object.keys(body).find((key) => !accepted.includes(key));
  return unknown ? `unknown field: ${unknown}` : null;
}

function periodValue(value: unknown): value is Period {
  return value === "daily" || value === "weekly" || value === "monthly";
}

export function validateRunnersInput(input: unknown): Validation<RunnerInput> {
  const body = recordBody(input);
  if (body.period === undefined) {
    return {
      ok: false,
      missing: ["period"],
      required: INPUT_SCHEMAS.runners,
    };
  }
  const extra = unknownKeys(body, [
    "period",
    "market",
    "direction",
    "limit",
    "minVolumeUsd",
  ]);
  if (extra) return { ok: false, error: extra };
  if (!periodValue(body.period)) {
    return { ok: false, error: "period must be daily, weekly, or monthly" };
  }
  const market = body.market ?? "perp";
  if (market !== "perp" && market !== "spot") {
    return { ok: false, error: "market must be perp or spot" };
  }
  const direction = body.direction ?? "up";
  if (direction !== "up" && direction !== "down") {
    return { ok: false, error: "direction must be up or down" };
  }
  const limit = body.limit ?? 10;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    return { ok: false, error: "limit must be an integer from 1 to 50" };
  }
  const minVolumeUsd = body.minVolumeUsd ?? 100_000;
  if (
    typeof minVolumeUsd !== "number" ||
    !Number.isFinite(minVolumeUsd) ||
    minVolumeUsd < 0
  ) {
    return { ok: false, error: "minVolumeUsd must be a non-negative number" };
  }
  return {
    ok: true,
    value: { period: body.period, market, direction, limit, minVolumeUsd },
  };
}

export function validateSignalInput(
  input: unknown,
  snapshot?: MarketSnapshot,
): Validation<SignalInput> {
  const body = recordBody(input);
  if (body.symbol === undefined) {
    return {
      ok: false,
      missing: ["symbol"],
      required: INPUT_SCHEMAS.signal,
    };
  }
  const extra = unknownKeys(body, ["symbol", "period"]);
  if (extra) return { ok: false, error: extra };
  if (typeof body.symbol !== "string" || !body.symbol.trim()) {
    return { ok: false, error: "symbol must be a non-empty string" };
  }
  const period = body.period ?? "weekly";
  if (!periodValue(period)) {
    return { ok: false, error: "period must be daily, weekly, or monthly" };
  }
  if (snapshot && !resolveSymbol(body.symbol, snapshot)) {
    return {
      ok: false,
      error: `unknown symbol: ${body.symbol}`,
    };
  }
  return { ok: true, value: { symbol: body.symbol, period } };
}

export function validatePreIpoInput(
  input: unknown,
  snapshot?: MarketSnapshot,
): Validation<{ symbol?: string }> {
  const body = recordBody(input);
  const extra = unknownKeys(body, ["symbol"]);
  if (extra) return { ok: false, error: extra };
  if (body.symbol === undefined) return { ok: true, value: {} };
  if (typeof body.symbol !== "string" || !body.symbol.trim()) {
    return { ok: false, error: "symbol must be a non-empty string" };
  }
  if (snapshot) {
    const resolved = resolveSymbol(body.symbol, snapshot);
    if (!resolved || resolved.market !== "perp" || !resolved.instrument.preIpo) {
      return {
        ok: false,
        error: `symbol is not a pre-IPO contract: ${body.symbol}`,
      };
    }
  }
  return { ok: true, value: { symbol: body.symbol } };
}
