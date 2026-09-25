import type {
  Bar,
  Funding,
  IndexPrice,
  Instrument,
  MarketType,
  OpenInterest,
  OrderBook,
  RubikPositioning,
  Ticker,
} from "../intel/types.js";

export interface OkxEnvelope<T> {
  code: string;
  msg: string;
  data: T[];
}

export function parseEnvelope<T>(input: unknown): OkxEnvelope<T> {
  if (
    input === null ||
    typeof input !== "object" ||
    !("code" in input) ||
    !("data" in input)
  ) {
    throw new Error("unexpected OKX response envelope");
  }
  const envelope = input as { code: unknown; msg?: unknown; data: unknown };
  if (envelope.code !== "0") {
    throw new Error(
      `OKX error code=${String(envelope.code)} msg=${String(envelope.msg ?? "")}`,
    );
  }
  if (!Array.isArray(envelope.data)) {
    throw new Error("unexpected OKX response data shape");
  }
  return {
    code: "0",
    msg: typeof envelope.msg === "string" ? envelope.msg : "",
    data: envelope.data as T[],
  };
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`unexpected OKX row: missing ${key}`);
  }
  return value;
}

function unixDate(value: unknown): string | null {
  const timestamp = numberValue(value);
  return timestamp && timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

export function parseInstrumentRows(
  rows: Record<string, unknown>[],
  market: MarketType,
): Instrument[] {
  return rows
    .filter((row) => {
      if (
        row.instCategory !== "3" ||
        row.state !== "live" ||
        typeof row.instId !== "string"
      ) {
        return false;
      }
      return market === "perp"
        ? row.instType === "SWAP" && row.settleCcy === "USDT"
        : row.instType === "SPOT" && row.quoteCcy === "USDT";
    })
    .map((row) => {
      const instId = requiredString(row, "instId");
      const symbol =
        market === "perp"
          ? typeof row.ctValCcy === "string" && row.ctValCcy
            ? row.ctValCcy
            : instId.split("-")[0]!
          : requiredString(row, "baseCcy");
      return {
        symbol,
        instId,
        market,
        preIpo: market === "perp" && row.ruleType === "pre_market",
        maxLeverage: numberValue(row.lever),
        listedAt: unixDate(row.listTime),
        baseCcy: market === "perp" ? symbol : requiredString(row, "baseCcy"),
      };
    });
}

export function parseTickerRows(
  rows: Record<string, unknown>[],
  market: MarketType,
): Record<string, Ticker> {
  const result: Record<string, Ticker> = {};
  for (const row of rows) {
    const instId = requiredString(row, "instId");
    const last = numberValue(row.last);
    if (last === null) throw new Error(`unexpected OKX ticker for ${instId}`);
    const quoteVolume = numberValue(row.volCcy24h) ?? 0;
    result[instId] = {
      instId,
      last,
      bid: numberValue(row.bidPx),
      ask: numberValue(row.askPx),
      open24h: numberValue(row.open24h),
      high24h: numberValue(row.high24h),
      low24h: numberValue(row.low24h),
      vol24hUsd: market === "perp" ? quoteVolume * last : quoteVolume,
      ts: numberValue(row.ts) ?? 0,
    };
  }
  return result;
}

export function parseIndexRows(
  rows: Record<string, unknown>[],
): Record<string, IndexPrice> {
  const result: Record<string, IndexPrice> = {};
  for (const row of rows) {
    const instId = requiredString(row, "instId");
    const idxPx = numberValue(row.idxPx);
    if (idxPx !== null) result[instId] = { idxPx, ts: numberValue(row.ts) ?? 0 };
  }
  return result;
}

export function parseFundingRows(
  rows: Record<string, unknown>[],
): Record<string, Funding> {
  const result: Record<string, Funding> = {};
  for (const row of rows) {
    const instId = requiredString(row, "instId");
    result[instId] = {
      fundingRate: numberValue(row.fundingRate),
      nextFundingTime: numberValue(row.nextFundingTime),
    };
  }
  return result;
}

export function parseOpenInterestRows(
  rows: Record<string, unknown>[],
): Record<string, OpenInterest> {
  const result: Record<string, OpenInterest> = {};
  for (const row of rows) {
    const instId = requiredString(row, "instId");
    result[instId] = {
      oiUsd: numberValue(row.oiUsd),
      ts: numberValue(row.ts) ?? 0,
    };
  }
  return result;
}

export function parseCandleRows(rows: unknown[]): Bar[] {
  const bars = rows.map((row) => {
    if (!Array.isArray(row) || row.length < 9) {
      throw new Error("unexpected OKX candle row shape");
    }
    const values = row.map(numberValue);
    if (values.slice(0, 8).some((value) => value === null)) {
      throw new Error("unexpected non-numeric OKX candle row");
    }
    return {
      ts: values[0]!,
      open: values[1]!,
      high: values[2]!,
      low: values[3]!,
      close: values[4]!,
      volume: values[7]!,
      confirmed: row[8] === "1",
    };
  });
  return bars.sort((left, right) => left.ts - right.ts);
}

export function parseRubikOpenInterestRows(
  rows: unknown[],
): [number, number, number, number][] {
  return rows.map((row) => {
    if (!Array.isArray(row) || row.length < 4) {
      throw new Error("unexpected OKX Rubik open-interest row shape");
    }
    const values = row.slice(0, 4).map(numberValue);
    if (values.some((value) => value === null)) {
      throw new Error("unexpected non-numeric OKX Rubik open-interest row");
    }
    return [values[0]!, values[1]!, values[2]!, values[3]!];
  });
}

export function parseRubikLongShortRows(rows: unknown[]): number | null {
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!Array.isArray(row) || row.length < 2) {
    throw new Error("unexpected OKX Rubik long-short row shape");
  }
  return numberValue(row[1]);
}

export function parseRubikTakerRows(
  rows: unknown[],
): [number, number, number][] {
  return rows.map((row) => {
    if (!Array.isArray(row) || row.length < 3) {
      throw new Error("unexpected OKX Rubik taker-volume row shape");
    }
    const values = row.slice(0, 3).map(numberValue);
    if (values.some((value) => value === null)) {
      throw new Error("unexpected non-numeric OKX Rubik taker-volume row");
    }
    return [values[0]!, values[1]!, values[2]!];
  });
}

export function parseOrderBookRow(row: Record<string, unknown>): OrderBook {
  const parseLevels = (value: unknown): OrderBook["bids"] => {
    if (!Array.isArray(value)) throw new Error("unexpected OKX order-book side");
    return value.map((level) => {
      if (!Array.isArray(level) || level.length < 2) {
        throw new Error("unexpected OKX order-book level shape");
      }
      const price = numberValue(level[0]);
      const size = numberValue(level[1]);
      if (price === null || size === null) {
        throw new Error("unexpected non-numeric OKX order-book level");
      }
      return { price, size };
    });
  };
  return {
    bids: parseLevels(row.bids),
    asks: parseLevels(row.asks),
    ts: numberValue(row.ts) ?? 0,
  };
}

export function emptyRubikPositioning(): RubikPositioning {
  return {
    oiHistory: [],
    longShortAccountRatio: null,
    takerVolume: [],
  };
}
