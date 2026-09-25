import { parseEnvelope } from "./parsers.js";

const RETRIES = 3;
const RETRY_BACKOFF_MS = [250, 500, 1_000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

export class OkxClient {
  private readonly baseUrl: string;
  private readonly marketRequests = new Semaphore(4);
  private rubikTail: Promise<void> = Promise.resolve();
  private lastRubikStart = 0;

  constructor(baseUrl = "https://www.okx.com") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async get<T>(path: string): Promise<T[]> {
    return this.request<T>(path, true);
  }

  async rubik<T>(path: string): Promise<T[]> {
    const result = this.rubikTail.then(async () => {
      const wait = 450 - (Date.now() - this.lastRubikStart);
      if (wait > 0) await delay(wait);
      this.lastRubikStart = Date.now();
      return this.request<T>(path, false);
    });
    this.rubikTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async request<T>(path: string, marketBucket: boolean): Promise<T[]> {
    const run = async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
        try {
          const response = await fetch(`${this.baseUrl}${path}`, {
            headers: {
              accept: "application/json",
              "user-agent": "Mozilla/5.0 (compatible; ultrax-api/2.0)",
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            const error = new Error(`OKX HTTP ${response.status} for ${path}`);
            if (!retryable || attempt === RETRIES) throw error;
            lastError = error;
          } else {
            const envelope = parseEnvelope<T>(await response.json());
            return envelope.data;
          }
        } catch (error) {
          lastError = error;
          const retryable =
            !(error instanceof Error && error.message.startsWith("OKX HTTP 4"));
          if (!retryable || attempt === RETRIES) {
            throw error instanceof Error ? error : new Error(String(error));
          }
        }
        await delay(RETRY_BACKOFF_MS[attempt]!);
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    };
    return marketBucket ? this.marketRequests.run(run) : run();
  }
}
