import crypto from "node:crypto";

export class OkxNotConfiguredError extends Error {
  constructor() {
    super("OKX API credentials are not configured");
    this.name = "OkxNotConfiguredError";
  }
}

export class OkxError extends Error {
  constructor(
    public readonly code: string,
    msg: string,
  ) {
    super(`OKX error ${code}: ${msg}`);
    this.name = "OkxError";
  }
}

export interface OkxCredentials {
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
  baseUrl: string;
}

export interface RawLog {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  data: string;
  topics: string[];
  timestampMs: number;
}

export interface StatsHistoryItem {
  date: string;
  newAddressCount: number | null;
  totalTransactionCount: number | null;
  totalContractCalls: number | null;
  transactionFee: number | null;
  networkUtilization: number | null;
}

export interface TopHoldersResult {
  token: string;
  top10Pct: number | null;
  top50Pct: number | null;
  top100Pct: number | null;
  top20Pct: number | null;
  holders: { address: string; pct: number | null; balance: number | null }[];
  source: string;
}

export function okxSign(
  secretKey: string,
  isoTimestamp: string,
  method: string,
  requestPath: string,
): string {
  const prehash = `${isoTimestamp}${method}${requestPath}`;
  return crypto
    .createHmac("sha256", secretKey)
    .update(prehash)
    .digest("base64");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

export class OkxClient {
  constructor(private readonly creds: OkxCredentials) {}

  async get<T = unknown>(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const { apiKey, secretKey, passphrase } = this.creds;
    if (!apiKey || !secretKey || !passphrase) {
      throw new OkxNotConfiguredError();
    }
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    const requestPath = qs ? `${path}?${qs}` : path;
    const url = `${this.creds.baseUrl}${requestPath}`;

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const timestamp = new Date().toISOString();
      const sign = okxSign(secretKey, timestamp, "GET", requestPath);
      try {
        const res = await fetch(url, {
          headers: {
            "OK-ACCESS-KEY": apiKey,
            "OK-ACCESS-SIGN": sign,
            "OK-ACCESS-TIMESTAMP": timestamp,
            "OK-ACCESS-PASSPHRASE": passphrase,
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`HTTP ${res.status}`);
          await sleep(500 * 2 ** attempt);
          continue;
        }
        const body = (await res.json()) as {
          code?: string | number;
          msg?: string;
          data?: T;
        };
        if (String(body.code) === "0") return body.data as T;
        throw new OkxError(String(body.code ?? res.status), body.msg ?? "");
      } catch (err) {
        if (err instanceof OkxError) throw err;
        lastErr = err;
        await sleep(500 * 2 ** attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private async supportedChains(path: string): Promise<string[]> {
    // TODO(okx): confirm supported-chains response item shape
    const data = await this.get<unknown>(path);
    const arr = Array.isArray(data)
      ? data
      : Array.isArray((data as { data?: unknown[] })?.data)
        ? (data as { data: unknown[] }).data
        : [];
    return arr
      .map((item) => {
        if (typeof item === "string" || typeof item === "number")
          return String(item);
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          const v = pick(o, "chainIndex", "chainId", "chain");
          return v !== undefined ? String(v) : null;
        }
        return null;
      })
      .filter((x): x is string => x !== null);
  }

  infoSupportedChains(): Promise<string[]> {
    return this.supportedChains("/api/v6/explorer/info/supported-chains");
  }

  logSupportedChains(): Promise<string[]> {
    return this.supportedChains(
      "/api/v6/explorer/transaction-log/supported-chains",
    );
  }

  async infoStats(
    chainIndex: string,
    limit = 30,
  ): Promise<StatsHistoryItem[]> {
    // TODO(okx): confirm info/stats param names (chainIndex, limit) and item shape
    const data = await this.get<unknown>("/api/v6/explorer/info/stats", {
      chainIndex,
      limit,
    });
    const list = Array.isArray(data)
      ? data
      : ((data as { statsHistoryList?: unknown[] })?.statsHistoryList ??
        (data as { list?: unknown[] })?.list ??
        []);
    return (list as Record<string, unknown>[]).map((r) => ({
      date: String(pick(r, "date", "time", "statTime") ?? ""),
      newAddressCount: toNum(pick(r, "newAddressCount", "new_address_count")),
      totalTransactionCount: toNum(
        pick(r, "totalTransactionCount", "transactionCount", "txCount"),
      ),
      totalContractCalls: toNum(
        pick(r, "totalContractCalls", "contractCalls", "contractCallCount"),
      ),
      transactionFee: toNum(pick(r, "transactionFee", "txFee", "fee")),
      networkUtilization: toNum(
        pick(r, "networkUtilization", "utilization", "tps"),
      ),
    }));
  }

  async infoSummary(chainIndex: string): Promise<unknown> {
    // TODO(okx): confirm info/summary param names and response shape
    return this.get("/api/v6/explorer/info/summary", { chainIndex });
  }

  async logsByAddressAndTopic(opts: {
    chainIndex: string;
    address: string;
    topic0: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ logs: RawLog[]; cursor: string }> {
    // TODO(okx): confirm logs endpoint path and cursor param name
    const data = await this.get<unknown>(
      "/api/v6/explorer/transaction-log/logs-by-address-and-topic",
      {
        chainIndex: opts.chainIndex,
        address: opts.address,
        topic0: opts.topic0,
        cursor: opts.cursor,
        limit: opts.limit ?? 1000,
      },
    );
    const obj = (data ?? {}) as Record<string, unknown>;
    const list = (Array.isArray(data) ? data : obj.logs ?? obj.list ?? []) as Record<
      string,
      unknown
    >[];
    const cursor = String(obj.cursor ?? "");
    const logs: RawLog[] = list.map((r) => {
      const topics = Array.isArray(r.topics)
        ? (r.topics as string[])
        : typeof r.topics === "string"
          ? (r.topics as string).split(",")
          : [];
      return {
        txHash: String(pick(r, "txHash", "txId", "transactionHash") ?? ""),
        logIndex: Number(pick(r, "logIndex", "index") ?? 0),
        blockNumber: BigInt(
          String(pick(r, "blockNumber", "height", "blockHeight") ?? 0),
        ),
        data: String(r.data ?? "0x"),
        topics,
        timestampMs: Number(
          pick(r, "transactionTime", "blockTime", "timestamp") ?? 0,
        ),
      };
    });
    return { logs, cursor };
  }

  async currentPrice(
    chainIndex: string,
    tokenAddress: string,
  ): Promise<number | null> {
    // TODO(okx): confirm current-price param shape (native coin tokenContractAddress placeholder)
    const data = await this.get<unknown>("/api/v6/dex/index/current-price", {
      chainIndex,
      tokenContractAddress: tokenAddress,
    });
    const arr = Array.isArray(data)
      ? data
      : ((data as { data?: unknown[] })?.data ?? []);
    const first = arr[0] as Record<string, unknown> | undefined;
    return toNum(pick(first ?? {}, "price", "usdPrice", "priceUsd"));
  }

  async topHolders(tokenAddress: string): Promise<TopHoldersResult> {
    const parse = (data: unknown, source: string): TopHoldersResult => {
      // TODO(okx): confirm top-holders response field names
      const obj = (data ?? {}) as Record<string, unknown>;
      const listRaw = Array.isArray(data)
        ? data
        : (obj.holders ??
          obj.holderList ??
          obj.topHolders ??
          obj.list ??
          []) as Record<string, unknown>[];
      const holders = listRaw.map((h) => ({
        address: String(
          pick(h, "address", "holderAddress", "walletAddress") ?? "",
        ),
        pct: toNum(
          pick(h, "pct", "percentage", "holdPercentage", "ratio"),
        ),
        balance: toNum(pick(h, "balance", "amount", "holding")),
      }));
      const sumPct = (n: number): number | null => {
        const top = holders.slice(0, n);
        if (top.length === 0) return null;
        if (top.every((h) => h.pct !== null))
          return top.reduce((s, h) => s + (h.pct ?? 0), 0);
        return null;
      };
      return {
        token: tokenAddress,
        top10Pct:
          toNum(pick(obj, "top10Pct", "top10")) ?? sumPct(10),
        top50Pct:
          toNum(pick(obj, "top50Pct", "top50")) ?? sumPct(50),
        top100Pct:
          toNum(pick(obj, "top100Pct", "top100")) ?? sumPct(100),
        top20Pct:
          toNum(pick(obj, "top20Pct", "top20")) ?? sumPct(20),
        holders,
        source,
      };
    };

    try {
      const data = await this.get(
        "/api/v6/dex/market/token/cluster/top-holders",
        { chainIndex: "196", tokenContractAddress: tokenAddress },
      );
      return parse(data, "cluster/top-holders");
    } catch (err) {
      if (!(err instanceof OkxError && err.code === "50038")) throw err;
      const data = await this.get("/api/v6/dex/market/token/holder", {
        chainIndex: "196",
        tokenContractAddress: tokenAddress,
        limit: 20,
      });
      return parse(data, "token/holder");
    }
  }

  async blockList(
    chainIndex: string,
    cursor?: string,
  ): Promise<Record<string, unknown>[]> {
    // TODO(okx): confirm block-list param/response shapes
    const data = await this.get<unknown>(
      "/api/v6/explorer/block/block-list",
      { chainIndex, cursor, limit: 100 },
    );
    const obj = (data ?? {}) as Record<string, unknown>;
    return (Array.isArray(data) ? data : obj.blockList ?? obj.list ?? []) as Record<
      string,
      unknown
    >[];
  }

  async transactionList(
    chainIndex: string,
    blockHeight: string,
  ): Promise<Record<string, unknown>[]> {
    // TODO(okx): confirm transaction-list param/response shapes
    const data = await this.get<unknown>(
      "/api/v6/explorer/block/transaction-list",
      { chainIndex, height: blockHeight },
    );
    const obj = (data ?? {}) as Record<string, unknown>;
    return (Array.isArray(data)
      ? data
      : obj.transactionList ?? obj.list ?? []) as Record<string, unknown>[];
  }
}
