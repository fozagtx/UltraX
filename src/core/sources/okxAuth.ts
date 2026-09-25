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

export class OkxClient {
  constructor(private readonly creds: OkxCredentials) {}

  get configured(): boolean {
    return Boolean(
      this.creds.apiKey && this.creds.secretKey && this.creds.passphrase,
    );
  }

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
}
