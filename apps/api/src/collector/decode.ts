export interface DecodedTransfer {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  from: string;
  to: string;
  amount: string;
}

export function decodeTransfer(log: {
  data: string;
  topics: string[];
  transactionHash?: string | null;
  logIndex?: number | null;
  blockNumber?: bigint | null;
}): DecodedTransfer | null {
  if (log.topics.length < 3) return null;
  const topicAddr = (t: string) => `0x${t.slice(-40).toLowerCase()}`;
  const raw = BigInt(log.data);
  const whole = raw / 1_000_000n;
  const frac = raw % 1_000_000n;
  return {
    txHash: log.transactionHash ?? "",
    logIndex: log.logIndex ?? 0,
    blockNumber: log.blockNumber ?? 0n,
    from: topicAddr(log.topics[1]!),
    to: topicAddr(log.topics[2]!),
    amount: `${whole}.${frac.toString().padStart(6, "0")}`,
  };
}

export function isMint(from: string): boolean {
  return from === "0x0000000000000000000000000000000000000000";
}
