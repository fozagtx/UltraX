export interface Usdt0LogsState {
  headBlock: number;
  tailBlock: number;
  backfillComplete: boolean;
  source: "rpc" | "okx";
}

export interface BlockRange {
  from: number;
  to: number;
}

export interface ScanPlan {
  /** when set, persist this initial state before scanning */
  init: { headBlock: number; tailBlock: number } | null;
  /** forward scan of blocks newer than the stored head */
  catchUp: BlockRange | null;
  /** next downward range for historical backfill */
  backfill: BlockRange | null;
}

export const SCAN_RANGE_SIZE = 2000;

export function isValidState(v: unknown): v is Usdt0LogsState {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.headBlock === "number" &&
    typeof s.tailBlock === "number" &&
    typeof s.backfillComplete === "boolean"
  );
}

export function planScan(
  state: Usdt0LogsState | null,
  latest: number,
  rangeSize: number = SCAN_RANGE_SIZE,
): ScanPlan {
  if (!state) {
    return {
      init: { headBlock: latest + 1, tailBlock: latest + 1 },
      catchUp: null,
      backfill: { from: Math.max(0, latest - rangeSize + 1), to: latest },
    };
  }
  return {
    init: null,
    catchUp:
      latest > state.headBlock
        ? { from: state.headBlock + 1, to: latest }
        : null,
    backfill:
      !state.backfillComplete && state.tailBlock > 0
        ? {
            from: Math.max(0, state.tailBlock - rangeSize),
            to: state.tailBlock - 1,
          }
        : null,
  };
}

export interface AlertableTransfer {
  txHash: string;
  logIndex: number;
  ts: Date;
  amount: string;
  from: string;
  to: string;
}

const ALERT_MAX_AGE_MS = 60 * 60 * 1000;

export function filterAlertableTransfers<
  T extends AlertableTransfer,
>(items: T[], nowMs: number): T[] {
  return items.filter((t) => nowMs - t.ts.getTime() <= ALERT_MAX_AGE_MS);
}
