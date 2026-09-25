import {
  createPublicClient,
  fallback,
  http,
  defineChain,
  type Log,
  type PublicClient,
} from "viem";
import { USDT0_ADDRESS } from "@ultrax/metrics";
import { decodeTransfer } from "../collector/decode.js";

export { decodeTransfer };

export const xlayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.xlayer.tech"] },
  },
});

let client: PublicClient | null = null;

function buildClient(rpcUrls: string[]): PublicClient {
  return createPublicClient({
    chain: xlayer,
    transport: fallback(rpcUrls.map((u) => http(u, { timeout: 15_000 }))),
  });
}

export function getClient(rpcUrls: string[]): PublicClient {
  if (!client) client = buildClient(rpcUrls);
  return client;
}

export async function getLatestBlock(rpcUrls: string[]): Promise<bigint> {
  return getClient(rpcUrls).getBlockNumber();
}

export async function getLogsRange(
  rpcUrls: string[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  return getClient(rpcUrls).getLogs({
    address: USDT0_ADDRESS as `0x${string}`,
    event: {
      type: "event",
      name: "Transfer",
      inputs: [
        { type: "address", name: "from", indexed: true },
        { type: "address", name: "to", indexed: true },
        { type: "uint256", name: "value", indexed: false },
      ],
    },
    fromBlock,
    toBlock,
  });
}

const tsCache = new Map<bigint, number>();
const TS_CACHE_MAX = 10_000;

export async function getBlockTimestamp(
  rpcUrls: string[],
  blockNumber: bigint,
): Promise<number> {
  const hit = tsCache.get(blockNumber);
  if (hit !== undefined) return hit;
  const block = await getClient(rpcUrls).getBlock({ blockNumber });
  const ts = Number(block.timestamp) * 1000;
  if (tsCache.size >= TS_CACHE_MAX) tsCache.clear();
  tsCache.set(blockNumber, ts);
  return ts;
}

export interface RpcTransfer {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  ts: Date;
  from: string;
  to: string;
  amount: string;
}

/**
 * Scan a single block range for USDT0 Transfer logs, batching decoded
 * transfers to onBatch. On RPC error the range is bisected recursively;
 * ranges under 50 blocks that still fail are rethrown.
 */
export async function scanRange(
  rpcUrls: string[],
  fromBlock: bigint,
  toBlock: bigint,
  onBatch: (items: RpcTransfer[]) => Promise<void>,
): Promise<void> {
  let logs: Log[];
  try {
    logs = await getLogsRange(rpcUrls, fromBlock, toBlock);
  } catch (err) {
    if (toBlock - fromBlock < 50n) throw err;
    const mid = (fromBlock + toBlock) / 2n;
    await scanRange(rpcUrls, fromBlock, mid, onBatch);
    await scanRange(rpcUrls, mid + 1n, toBlock, onBatch);
    return;
  }
  const decoded = logs
    .map((log) =>
      decodeTransfer(
        log as unknown as { data: string; topics: string[] } & Log,
      ),
    )
    .filter((d): d is NonNullable<typeof d> => d !== null && !!d.txHash);
  if (!decoded.length) return;
  const uniqueBlocks = [...new Set(decoded.map((d) => d.blockNumber))];
  const tsMap = new Map<bigint, number>();
  for (let i = 0; i < uniqueBlocks.length; i += 16) {
    const chunk = uniqueBlocks.slice(i, i + 16);
    const tss = await Promise.all(
      chunk.map((b) => getBlockTimestamp(rpcUrls, b)),
    );
    chunk.forEach((b, j) => tsMap.set(b, tss[j]!));
  }
  await onBatch(
    decoded.map((d) => ({ ...d, ts: new Date(tsMap.get(d.blockNumber)!) })),
  );
}
