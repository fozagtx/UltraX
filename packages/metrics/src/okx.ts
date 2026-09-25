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

export interface TopHolder {
  address: string;
  pct: number | null;
  balance: number | null;
  isContract?: boolean;
  isExchange?: boolean;
}

export interface TopHoldersResult {
  token: string;
  chainId: number;
  top10Pct: number | null;
  top50Pct: number | null;
  top100Pct: number | null;
  top20Pct: number | null;
  holders: TopHolder[];
  source: "cluster" | "token-holder";
  fetchedAt: string;
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

// data: [{ limit, cursor, logList: [{ height, address, topics, data,
// methodId, blockHash, transactionTime (ms string), logIndex (string), txId }] }]
export function parseLogListPage(data: unknown): {
  logs: RawLog[];
  cursor: string;
} {
  const page = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | undefined;
  const list = (page?.logList ?? []) as Record<string, unknown>[];
  const logs: RawLog[] = list.map((r) => ({
    txHash: String(r.txId ?? ""),
    logIndex: Number(r.logIndex ?? 0),
    blockNumber: BigInt(String(r.height ?? 0)),
    data: String(r.data ?? "0x"),
    topics: Array.isArray(r.topics) ? (r.topics as string[]) : [],
    timestampMs: Number(r.transactionTime ?? 0),
  }));
  return { logs, cursor: String(page?.cursor ?? "") };
}

// data: [{ limit, cursor, statsHistoryList: [{ time (ms string, daily),
// newAddressCount, totalTransactionCount, totalContractCalls,
// transactionFee, networkUtilization }] }] sorted desc
export function parseStatsHistoryPage(data: unknown): StatsHistoryItem[] {
  const page = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | undefined;
  const list = (page?.statsHistoryList ?? []) as Record<string, unknown>[];
  return list.map((r) => {
    const ms = Number(r.time ?? 0);
    return {
      date: ms ? new Date(ms).toISOString().slice(0, 10) : "",
      newAddressCount: toNum(r.newAddressCount),
      totalTransactionCount: toNum(r.totalTransactionCount),
      totalContractCalls: toNum(r.totalContractCalls),
      transactionFee: toNum(r.transactionFee),
      networkUtilization: toNum(r.networkUtilization),
    };
  });
}

// data: [{ name, logoUrl, shortName, chainIndex }]
export function parseSupportedChains(data: unknown): string[] {
  const arr = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return arr
    .map((item) => {
      const v = pick(item, "chainIndex", "chainId", "name");
      return v !== undefined ? String(v) : null;
    })
    .filter((x): x is string => x !== null);
}

export class OkxClient {
  constructor(private readonly creds: OkxCredentials) {}

  private requireCreds() {
    const { apiKey, secretKey, passphrase } = this.creds;
    if (!apiKey || !secretKey || !passphrase) {
      throw new OkxNotConfiguredError();
    }
    return { apiKey, secretKey, passphrase };
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    query?: Record<string, string | number | undefined>,
    bodyJson?: unknown,
  ): Promise<T> {
    const { apiKey, secretKey, passphrase } = this.requireCreds();
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(
            ([k, v]) =>
              `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
          )
          .join("&")
      : "";
    const requestPath = qs ? `${path}?${qs}` : path;
    const bodyString = bodyJson !== undefined ? JSON.stringify(bodyJson) : "";
    const signTarget =
      method === "POST" ? requestPath + bodyString : requestPath;
    const url = `${this.creds.baseUrl}${requestPath}`;

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const timestamp = new Date().toISOString();
      const sign = okxSign(secretKey, timestamp, method, signTarget);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            "OK-ACCESS-KEY": apiKey,
            "OK-ACCESS-SIGN": sign,
            "OK-ACCESS-TIMESTAMP": timestamp,
            "OK-ACCESS-PASSPHRASE": passphrase,
            "Content-Type": "application/json",
          },
          body: method === "POST" ? bodyString : undefined,
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

  get<T = unknown>(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    return this.request<T>("GET", path, query);
  }

  post<T = unknown>(path: string, bodyJson: unknown): Promise<T> {
    return this.request<T>("POST", path, undefined, bodyJson);
  }

  infoSupportedChains(): Promise<string[]> {
    return this.get("/api/v6/explorer/info/supported-chains").then(
      parseSupportedChains,
    );
  }

  logSupportedChains(): Promise<string[]> {
    return this.get("/api/v6/explorer/log/supported-chains").then(
      parseSupportedChains,
    );
  }

  async infoStats(
    chainIndex: string,
    limit = 30,
  ): Promise<StatsHistoryItem[]> {
    const data = await this.get("/api/v6/explorer/info/stats", {
      chainIndex,
      limit,
    });
    return parseStatsHistoryPage(data);
  }

  async infoSummary(chainIndex: string): Promise<unknown> {
    return this.get("/api/v6/explorer/info/summary", { chainIndex });
  }

  async logsByAddressAndTopic(opts: {
    chainIndex: string;
    address: string;
    topic0: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ logs: RawLog[]; cursor: string }> {
    const data = await this.get("/api/v6/explorer/log/by-address-and-topic", {
      chainIndex: opts.chainIndex,
      address: opts.address,
      topic0: opts.topic0,
      cursor: opts.cursor,
      limit: opts.limit ?? 100,
    });
    return parseLogListPage(data);
  }

  async currentPrice(
    chainIndex: string,
    tokenAddress: string,
  ): Promise<number | null> {
    const data = await this.post<unknown>("/api/v6/dex/index/current-price", [
      { chainIndex, tokenContractAddress: tokenAddress },
    ]);
    const arr = Array.isArray(data) ? data : [];
    const first = arr[0] as Record<string, unknown> | undefined;
    return toNum(first?.price);
  }

  // data: { holdingAmount, holdingPercent (fraction, e.g. "0.42483"),
  // clusterTrendType[], ... }; rangeFilter 1=top10, 2=top50, 3=top100
  private async clusterHoldingPct(
    tokenAddress: string,
    rangeFilter: 1 | 2 | 3,
  ): Promise<number | null> {
    const data = await this.get<unknown>(
      "/api/v6/dex/market/token/cluster/top-holders",
      {
        chainIndex: "196",
        tokenContractAddress: tokenAddress,
        rangeFilter,
      },
    );
    const obj = (data ?? {}) as Record<string, unknown>;
    const frac = toNum(obj.holdingPercent);
    return frac !== null ? frac * 100 : null;
  }

  // data: { clustList: [{ clusterAddressList: [{ addressRank, address,
  // holdingAmount, holdingPercent (fraction), isContract, isExchange, ... }] }] }
  private async clusterHolderList(tokenAddress: string): Promise<TopHolder[]> {
    try {
      const data = await this.get<unknown>(
        "/api/v6/dex/market/token/cluster/list",
        { chainIndex: "196", tokenContractAddress: tokenAddress },
      );
      const obj = (data ?? {}) as Record<string, unknown>;
      const clustList = (obj.clustList ?? []) as Record<string, unknown>[];
      const all: Record<string, unknown>[] = clustList.flatMap(
        (c) => (c.clusterAddressList ?? []) as Record<string, unknown>[],
      );
      all.sort(
        (a, b) => Number(a.addressRank ?? 0) - Number(b.addressRank ?? 0),
      );
      return all.slice(0, 20).map((h) => {
        const frac = toNum(h.holdingPercent);
        return {
          address: String(h.address ?? ""),
          pct: frac !== null ? frac * 100 : null,
          balance: toNum(h.holdingAmount),
          isContract: Boolean(h.isContract),
          isExchange: Boolean(h.isExchange),
        };
      });
    } catch {
      return [];
    }
  }

  // Fallback: data: [{ holderWalletAddress, holdAmount,
  // holdPercent (already a percent, e.g. "76.75"), ... }]
  private async tokenHolderFallback(
    tokenAddress: string,
  ): Promise<TopHoldersResult> {
    const data = await this.get<unknown>("/api/v6/dex/market/token/holder", {
      chainIndex: "196",
      tokenContractAddress: tokenAddress,
      limit: 20,
    });
    const list = (Array.isArray(data) ? data : []) as Record<
      string,
      unknown
    >[];
    const holders: TopHolder[] = list.map((h) => ({
      address: String(h.holderWalletAddress ?? ""),
      pct: toNum(h.holdPercent),
      balance: toNum(h.holdAmount),
    }));
    const sumPct = (n: number): number | null => {
      const top = holders.slice(0, n);
      if (top.length === 0 || top.some((h) => h.pct === null)) return null;
      return top.reduce((s, h) => s + (h.pct ?? 0), 0);
    };
    return {
      token: tokenAddress,
      chainId: 196,
      top10Pct: sumPct(10),
      top50Pct: null,
      top100Pct: null,
      top20Pct: sumPct(20),
      holders,
      source: "token-holder",
      fetchedAt: new Date().toISOString(),
    };
  }

  async topHolders(tokenAddress: string): Promise<TopHoldersResult> {
    try {
      const [top10Pct, top50Pct, top100Pct, holders] = await Promise.all([
        this.clusterHoldingPct(tokenAddress, 1),
        this.clusterHoldingPct(tokenAddress, 2),
        this.clusterHoldingPct(tokenAddress, 3),
        this.clusterHolderList(tokenAddress),
      ]);
      const top20Pct = holders.length
        ? holders.reduce((s, h) => s + (h.pct ?? 0), 0)
        : null;
      return {
        token: tokenAddress,
        chainId: 196,
        top10Pct,
        top50Pct,
        top100Pct,
        top20Pct,
        holders,
        source: "cluster",
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn(
        `okx cluster/top-holders failed for ${tokenAddress}, trying token/holder:`,
        err instanceof Error ? err.message : err,
      );
      return this.tokenHolderFallback(tokenAddress);
    }
  }

  async blockList(
    chainIndex: string,
    cursor?: string,
  ): Promise<Record<string, unknown>[]> {
    // TODO(okx): confirm block-list param and response field shapes
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

export function fetchHolderConcentration(
  creds: OkxCredentials,
  tokenAddress: string,
): Promise<TopHoldersResult> {
  return new OkxClient(creds).topHolders(tokenAddress);
}
