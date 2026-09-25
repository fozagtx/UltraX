import {
  decodeEventLog,
  encodeEventTopics,
  parseAbiItem,
} from "viem";
import {
  EXPLORER_BASE,
  USDT0_ADDRESS,
  USDT0_DECIMALS,
} from "@kwyh/core";
import { log } from "./log.js";

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const TOPICS = encodeEventTopics({ abi: [TRANSFER], eventName: "Transfer" });

export interface PaymentLog {
  txHash: string;
  from: string;
  amountUsd: number;
  blockNumber: number;
  timestamp: number; // ms epoch
  explorerUrl: string;
}

export interface PaymentScanState {
  warming: boolean;
  /** block number the initial scan started at (≈ now-24h), once known */
  scannedFrom: number | null;
  /** highest block fully scanned */
  lastScanned: number | null;
  payments: PaymentLog[]; // newest first, last 7 days
}

const LOOKBACK_MS = 7 * 86_400_000;
const REFRESH_MS = 2 * 60_000;

function hex(n: bigint): string {
  return `0x${n.toString(16)}`;
}

interface JsonRpcResp {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

async function rpcBatch(
  rpcUrl: string,
  calls: { method: string; params: unknown[] }[],
): Promise<unknown[]> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      calls.map((c, i) => ({ jsonrpc: "2.0", id: i + 1, ...c })),
    ),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`rpc HTTP ${res.status}`);
  const parsed = (await res.json()) as JsonRpcResp[] | JsonRpcResp;
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const byId = new Map(arr.map((r) => [r.id, r]));
  return calls.map((_c, i) => {
    const r = byId.get(i + 1);
    if (!r) throw new Error("rpc batch: missing response");
    if (r.error) throw new Error(`rpc ${r.error.code}: ${r.error.message}`);
    return r.result;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Incremental USDT0-transfer scanner for the payTo address.
 * Warms by binary-searching the block at now-24h and scanning forward in
 * <=100-block chunks, then refreshes only new blocks every 2 minutes.
 * Public X Layer RPCs cap eth_getLogs at ~100 blocks and rate-limit hard,
 * so calls are single, paced and rotated across providers.
 */
export function createPaymentScanner(opts: {
  rpcUrls: string[];
  payTo: string;
  onLog?: (level: "info" | "warn" | "error", msg: string, extra?: object) => void;
}) {
  const say =
    opts.onLog ??
    ((level: "info" | "warn" | "error", msg: string, extra?: object) =>
      log(level, msg, { job: "payments", ...extra }));
  const toTopic = `0x${opts.payTo.toLowerCase().replace("0x", "").padStart(64, "0")}`;
  const hosts = opts.rpcUrls;
  let hostIdx = 0;
  const nextHost = () => hosts[hostIdx++ % hosts.length];

  const state: PaymentScanState = {
    warming: true,
    scannedFrom: null,
    lastScanned: null,
    payments: [],
  };
  const seen = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  async function rpcCall(
    method: string,
    params: unknown[],
    attempts = 15,
  ): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const [r] = await rpcBatch(nextHost(), [{ method, params }]);
        return r;
      } catch (err) {
        lastErr = err;
        await sleep(Math.min(8_000, 500 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async function getBlock(n: bigint | "latest") {
    const b = (await rpcCall("eth_getBlockByNumber", [
      n === "latest" ? "latest" : hex(n),
      false,
    ])) as { number: string; timestamp: string } | null;
    if (!b) throw new Error(`block ${n} not found`);
    return { number: BigInt(b.number), ts: parseInt(b.timestamp, 16) * 1000 };
  }

  async function getLogs(from: bigint, to: bigint) {
    return (await rpcCall("eth_getLogs", [
      {
        address: USDT0_ADDRESS,
        topics: [TOPICS[0], null, toTopic],
        fromBlock: hex(from),
        toBlock: hex(to),
      },
    ])) as {
      transactionHash: string;
      blockNumber: string;
      logIndex: string;
      topics: string[];
      data: string;
    }[];
  }

  /** Binary-search the greatest block whose timestamp <= targetMs. */
  async function findBlockAtOrBefore(targetMs: number): Promise<bigint> {
    const head = await getBlock("latest");
    if (head.ts <= targetMs) return head.number;
    // estimate blocks/sec from a recent window to seed the search range
    const anchor = await getBlock(head.number - 50_000n);
    const rate =
      Number(head.number - anchor.number) / Math.max(1, head.ts - anchor.ts); // blocks per ms
    const est = head.number - BigInt(Math.ceil((head.ts - targetMs) * rate));
    const window = head.number - est; // ≈ blocks in 24h
    let lo = est - window / 4n > 0n ? est - window / 4n : 0n;
    let hi = est + window / 4n < head.number ? est + window / 4n : head.number;
    // bound the search: lo must be <= target, hi >= target
    for (let i = 0; i < 20; i++) {
      const b = await getBlock(lo);
      if (b.ts <= targetMs) break;
      hi = lo;
      lo = lo / 2n;
    }
    for (let i = 0; i < 20; i++) {
      const b = await getBlock(hi);
      if (b.ts > targetMs) break;
      lo = hi;
      hi = hi * 2n > head.number ? head.number : hi * 2n;
    }
    while (hi - lo > 1n) {
      const mid = (lo + hi) / 2n;
      const b = await getBlock(mid);
      if (b.ts <= targetMs) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  const blockTs = new Map<bigint, number>();
  async function tsFor(bn: bigint): Promise<number> {
    const hit = blockTs.get(bn);
    if (hit !== undefined) return hit;
    const b = await getBlock(bn);
    blockTs.set(bn, b.ts);
    return b.ts;
  }

  async function scanRange(from: bigint, to: bigint): Promise<void> {
    for (let s = from; s <= to; s += 100n) {
      const e = s + 99n > to ? to : s + 99n;
      const logs = await getLogs(s, e);
      for (const l of logs) {
        const key = `${l.transactionHash}:${l.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const d = decodeEventLog({
          abi: [TRANSFER],
          topics: l.topics as [`0x${string}`, ...`0x${string}`[]],
          data: l.data as `0x${string}`,
        });
        const args = d.args as { from: string; value: bigint };
        const bn = BigInt(l.blockNumber);
        state.payments.push({
          txHash: l.transactionHash,
          from: args.from,
          amountUsd: Number(args.value) / 10 ** USDT0_DECIMALS,
          blockNumber: Number(bn),
          timestamp: await tsFor(bn),
          explorerUrl: `${EXPLORER_BASE}/tx/${l.transactionHash}`,
        });
      }
      state.lastScanned = Number(e);
      await sleep(60); // pacing: public RPCs rate-limit aggressively
    }
    // newest first; keep only the last 7 days
    const cutoff = Date.now() - LOOKBACK_MS;
    state.payments = state.payments
      .filter((p) => p.timestamp >= cutoff)
      .sort((a, b) => b.blockNumber - a.blockNumber);
  }

  async function warm(): Promise<void> {
    const t0 = Date.now();
    const from = await findBlockAtOrBefore(Date.now() - 86_400_000);
    state.scannedFrom = Number(from);
    say("info", "payments scan: warm start", { scannedFrom: Number(from) });
    const head = (await getBlock("latest")).number;
    await scanRange(from, head);
    state.warming = false;
    say("info", "payments scan: warm complete", {
      secs: Math.round((Date.now() - t0) / 1000),
      payments: state.payments.length,
    });
  }

  async function refresh(): Promise<void> {
    const head = (await getBlock("latest")).number;
    const from =
      state.lastScanned !== null ? BigInt(state.lastScanned) + 1n : head;
    if (from > head) return;
    await scanRange(from, head);
  }

  return {
    state,
    start() {
      void (async () => {
        try {
          await warm();
        } catch (err) {
          say("error", "payments warm scan failed", { err: String(err) });
        }
        timer = setInterval(() => {
          // if the warm scan failed, retry it on the next tick
          const job = state.warming ? warm() : refresh();
          job.catch((err) =>
            say("warn", "payments scan failed", { err: String(err) }),
          );
        }, REFRESH_MS);
      })();
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
    isStopped: () => stopped,
  };
}
