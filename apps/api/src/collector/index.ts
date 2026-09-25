import cron, { type ScheduledTask } from "node-cron";
import { sql } from "drizzle-orm";
import {
  CHAIN_ID,
  USDT0_ADDRESS,
  TRANSFER_TOPIC0,
  ZERO_ADDRESS,
  EXPLORER_BASE,
  transfers,
  dailyStats,
  dailyStablecoin,
  alerts,
  alertDeliveries,
  setCollectorState,
  getCollectorState,
  type Db,
} from "@ultrax/metrics";
import { OkxClient, OkxNotConfiguredError, OkxError } from "@ultrax/metrics";
import {
  scanRange,
  getLatestBlock,
  getBlockTimestamp,
} from "../chain/rpc.js";
import { decodeTransfer, type DecodedTransfer } from "./decode.js";
import {
  planScan,
  isValidState,
  filterAlertableTransfers,
  SCAN_RANGE_SIZE,
  type Usdt0LogsState,
  type AlertableTransfer,
} from "./plan.js";
import { jobLog } from "../log.js";
import type { Env } from "../env.js";

export interface CollectorCtx {
  env: Env;
  db: Db;
  okx: OkxClient;
  rpcUrls: string[];
}

export interface CollectorHandle {
  stop(): void;
  lastRunAt(): string | null;
}

interface ChainSupport {
  stats: boolean;
  logs: boolean;
  checkedAt: string;
}

type AlertRow = typeof alerts.$inferSelect;
type StampedTransfer = DecodedTransfer & { ts: Date };

const BACKFILL_STEP_BUDGET_MS = 8 * 60 * 1000;

const running = new Set<string>();
let lastRun: string | null = null;

function wrap(ctx: CollectorCtx, name: string, fn: () => Promise<void>) {
  return async () => {
    if (running.has(name)) {
      jobLog("warn", name, "previous run still in progress, skipping");
      return;
    }
    running.add(name);
    try {
      await fn();
      lastRun = new Date().toISOString();
      jobLog("info", name, "done");
    } catch (err) {
      jobLog("error", name, "job failed", err);
    } finally {
      running.delete(name);
    }
  };
}

/**
 * Upserts transfers; resolves to the subset of items that were actually
 * inserted (deduped via ON CONFLICT DO NOTHING + RETURNING).
 */
async function upsertTransfers(
  db: Db,
  items: StampedTransfer[],
): Promise<StampedTransfer[]> {
  const inserted: StampedTransfer[] = [];
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500);
    const ret = await db
      .insert(transfers)
      .values(
        chunk.map((t) => ({
          txHash: t.txHash,
          logIndex: t.logIndex,
          blockNumber: t.blockNumber,
          ts: t.ts,
          fromAddr: t.from,
          toAddr: t.to,
          amount: t.amount,
        })),
      )
      .onConflictDoNothing()
      .returning({ txHash: transfers.txHash, logIndex: transfers.logIndex });
    const keys = new Set(ret.map((r) => `${r.txHash}:${r.logIndex}`));
    inserted.push(...chunk.filter((t) => keys.has(`${t.txHash}:${t.logIndex}`)));
  }
  return inserted;
}

export async function recomputeDailyStablecoin(
  db: Db,
  fromDate?: string,
): Promise<void> {
  const from = fromDate ?? "1970-01-01";
  await db.execute(sql`
    insert into daily_stablecoin (date, volume_usd, mint_usd, burn_usd, netflow_usd, transfer_count, updated_at)
    select
      (ts at time zone 'UTC')::date as date,
      coalesce(sum(amount), 0) as volume_usd,
      coalesce(sum(amount) filter (where from_addr = ${ZERO_ADDRESS}), 0) as mint_usd,
      coalesce(sum(amount) filter (where to_addr = ${ZERO_ADDRESS}), 0) as burn_usd,
      coalesce(sum(amount) filter (where from_addr = ${ZERO_ADDRESS}), 0)
        - coalesce(sum(amount) filter (where to_addr = ${ZERO_ADDRESS}), 0) as netflow_usd,
      count(*)::int as transfer_count,
      now() as updated_at
    from transfers
    where (ts at time zone 'UTC')::date >= ${from}::date
    group by 1
    on conflict (date) do update set
      volume_usd = excluded.volume_usd,
      mint_usd = excluded.mint_usd,
      burn_usd = excluded.burn_usd,
      netflow_usd = excluded.netflow_usd,
      transfer_count = excluded.transfer_count,
      updated_at = excluded.updated_at
  `);
}

async function getChainSupport(ctx: CollectorCtx): Promise<ChainSupport> {
  const cached = (await getCollectorState(ctx.db, "chain_support")) as
    | ChainSupport
    | null;
  if (cached) return cached;
  return checkChainSupport(ctx);
}

export async function checkChainSupport(
  ctx: CollectorCtx,
): Promise<ChainSupport> {
  const support: ChainSupport = {
    stats: false,
    logs: false,
    checkedAt: new Date().toISOString(),
  };
  try {
    const info = await ctx.okx.infoSupportedChains();
    support.stats = info.includes(String(CHAIN_ID));
  } catch (err) {
    jobLog("warn", "chain-support", "info supported-chains failed", err);
  }
  try {
    const logs = await ctx.okx.logSupportedChains();
    support.logs = logs.includes(String(CHAIN_ID));
  } catch (err) {
    jobLog("warn", "chain-support", "logs supported-chains failed", err);
  }
  await setCollectorState(ctx.db, "chain_support", support);
  jobLog("info", "chain-support", `chain support: ${JSON.stringify(support)}`);
  return support;
}

async function loadActiveAlerts(ctx: CollectorCtx): Promise<AlertRow[]> {
  const rows = await ctx.db.select().from(alerts);
  return rows.filter(
    (a) =>
      a.failures < 20 && (!a.expiresAt || a.expiresAt.getTime() > Date.now()),
  );
}

async function loadUsdt0State(
  ctx: CollectorCtx,
): Promise<Usdt0LogsState | null> {
  const raw = await getCollectorState(ctx.db, "usdt0_logs");
  if (isValidState(raw)) return raw;
  if (raw !== null && raw !== undefined) {
    jobLog("info", "usdt0-logs", "migrating legacy usdt0_logs state");
  }
  // Seed from whatever the transfers table already holds.
  const agg = await ctx.db.execute<{
    min_block: string | null;
    max_block: string | null;
    min_ts: string | null;
  }>(sql`select min(block_number) as min_block, max(block_number) as max_block,
         min(ts) as min_ts from transfers`);
  const row = agg.rows[0];
  if (!row?.min_block) return null;
  const cutoff = Date.now() - ctx.env.BACKFILL_DAYS * 86_400_000;
  const minTsMs = row.min_ts ? new Date(row.min_ts).getTime() : null;
  const seeded: Usdt0LogsState = {
    headBlock: Number(row.max_block),
    tailBlock: Number(row.min_block),
    backfillComplete: minTsMs !== null ? minTsMs < cutoff : false,
    source: "rpc",
  };
  await setCollectorState(ctx.db, "usdt0_logs", seeded);
  jobLog("info", "usdt0-logs", `seeded state from transfers: ${JSON.stringify(seeded)}`);
  return seeded;
}

async function syncUsdt0LogsOkx(ctx: CollectorCtx): Promise<void> {
  const cutoff = Date.now() - ctx.env.BACKFILL_DAYS * 86_400_000;
  const prev = await loadUsdt0State(ctx);
  const activeAlerts = await loadActiveAlerts(ctx);
  let cursor: string | undefined;
  const seen = new Set<string>();
  let done = false;
  let newest: StampedTransfer | null = null;
  let minDateTouched: string | null = null;
  let oldestSeenBlock: number | null = null;

  while (!done) {
    const page = await ctx.okx.logsByAddressAndTopic({
      chainIndex: String(CHAIN_ID),
      address: USDT0_ADDRESS,
      topic0: TRANSFER_TOPIC0,
      cursor,
      limit: 1000,
    });
    const items: StampedTransfer[] = [];
    for (const raw of page.logs) {
      const key = `${raw.txHash}:${raw.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (
        prev?.source === "okx" &&
        Number(raw.blockNumber) <= prev.headBlock
      ) {
        done = true;
        break;
      }
      if (raw.timestampMs && raw.timestampMs < cutoff) {
        done = true;
        break;
      }
      const d = decodeTransfer({
        data: raw.data,
        topics: raw.topics,
        transactionHash: raw.txHash,
        logIndex: raw.logIndex,
        blockNumber: raw.blockNumber,
      });
      if (!d || !d.txHash) continue;
      items.push({
        ...d,
        ts: raw.timestampMs ? new Date(raw.timestampMs) : new Date(),
      });
    }
    if (!newest && items.length) newest = items[0]!;
    for (const t of items) {
      const d = t.ts.toISOString().slice(0, 10);
      if (!minDateTouched || d < minDateTouched) minDateTouched = d;
      const bn = Number(t.blockNumber);
      if (oldestSeenBlock === null || bn < oldestSeenBlock)
        oldestSeenBlock = bn;
    }
    const inserted = await upsertTransfers(ctx.db, items);
    if (inserted.length)
      await dispatchAlerts(ctx, filterAlertableTransfers(inserted, Date.now()), activeAlerts);
    if (!page.cursor) {
      done = true;
    } else {
      cursor = page.cursor;
    }
  }

  if (minDateTouched) await recomputeDailyStablecoin(ctx.db, minDateTouched);
  if (newest) {
    const head = Number(newest.blockNumber);
    const tail = Math.min(
      oldestSeenBlock ?? head,
      prev?.tailBlock ?? Number.POSITIVE_INFINITY,
    );
    const tailTs = await getBlockTimestamp(ctx.rpcUrls, BigInt(tail)).catch(
      () => 0,
    );
    await setCollectorState(ctx.db, "usdt0_logs", {
      headBlock: head,
      tailBlock: Number.isFinite(tail) ? tail : head,
      backfillComplete: done && tailTs > 0 ? tailTs < cutoff : false,
      source: "okx",
    } satisfies Usdt0LogsState);
  }
}

async function syncUsdt0LogsRpc(ctx: CollectorCtx): Promise<void> {
  const deadline = Date.now() + BACKFILL_STEP_BUDGET_MS;
  const latest = Number(await getLatestBlock(ctx.rpcUrls));
  let state = await loadUsdt0State(ctx);
  const plan = planScan(state, latest, SCAN_RANGE_SIZE);
  if (plan.init) {
    state = {
      headBlock: plan.init.headBlock,
      tailBlock: plan.init.tailBlock,
      backfillComplete: false,
      source: "rpc",
    };
    await setCollectorState(ctx.db, "usdt0_logs", state);
  } else if (state) {
    state = { ...state, source: "rpc" };
  }

  const activeAlerts = await loadActiveAlerts(ctx);
  let minDateTouched: string | null = null;
  let insertedCount = 0;
  const onBatch = async (items: StampedTransfer[]) => {
    const inserted = await upsertTransfers(ctx.db, items);
    if (!inserted.length) return;
    insertedCount += inserted.length;
    for (const t of inserted) {
      const d = t.ts.toISOString().slice(0, 10);
      if (!minDateTouched || d < minDateTouched) minDateTouched = d;
    }
    await dispatchAlerts(ctx, filterAlertableTransfers(inserted, Date.now()), activeAlerts);
  };

  // Step 1: catch-up forward from stored head to latest.
  if (state && plan.catchUp) {
    const { from, to } = plan.catchUp;
    for (let f = from; f <= to; f += SCAN_RANGE_SIZE) {
      const t = Math.min(to, f + SCAN_RANGE_SIZE - 1);
      await scanRange(ctx.rpcUrls, BigInt(f), BigInt(t), onBatch);
    }
    state.headBlock = to;
    await setCollectorState(ctx.db, "usdt0_logs", state);
    jobLog("info", "usdt0-logs", `catch-up scanned ${from}..${to}`);
  }

  // Step 2: continue downward backfill within the wall-time budget.
  while (state && !state.backfillComplete && Date.now() < deadline) {
    const bf = planScan(state, latest, SCAN_RANGE_SIZE).backfill;
    if (!bf) {
      state.backfillComplete = true;
      await setCollectorState(ctx.db, "usdt0_logs", state);
      break;
    }
    await scanRange(ctx.rpcUrls, BigInt(bf.from), BigInt(bf.to), onBatch);
    const fromTs = await getBlockTimestamp(ctx.rpcUrls, BigInt(bf.from));
    state.tailBlock = bf.from;
    if (bf.from === 0 || fromTs < Date.now() - ctx.env.BACKFILL_DAYS * 86_400_000) {
      state.backfillComplete = true;
    }
    await setCollectorState(ctx.db, "usdt0_logs", state);
  }

  if (insertedCount) {
    await recomputeDailyStablecoin(ctx.db, minDateTouched ?? undefined);
    jobLog("info", "usdt0-logs", `inserted ${insertedCount} transfers`);
  }
}

export async function syncUsdt0Logs(ctx: CollectorCtx): Promise<void> {
  const support = await getChainSupport(ctx);
  if (support.logs) {
    try {
      await syncUsdt0LogsOkx(ctx);
      return;
    } catch (err) {
      if (err instanceof OkxError && err.code === "50038") {
        await checkChainSupport(ctx);
      }
      if (err instanceof OkxNotConfiguredError) {
        jobLog("warn", "usdt0-logs", "OKX not configured, using RPC");
      } else {
        jobLog("warn", "usdt0-logs", "OKX log stream failed, falling back to RPC", err);
      }
    }
  } else {
    jobLog("info", "usdt0-logs", "OKX logs unsupported for 196, using RPC");
  }
  await syncUsdt0LogsRpc(ctx);
}

async function getCachedOkbPrice(ctx: CollectorCtx): Promise<number | null> {
  const v = (await getCollectorState(ctx.db, "okb_price")) as {
    usd?: number;
  } | null;
  return v?.usd ?? null;
}

export async function syncDailyStats(ctx: CollectorCtx): Promise<void> {
  const support = await getChainSupport(ctx);
  if (!support.stats) {
    await computeDailyStatsFromBlocks(ctx);
    return;
  }
  const items = await ctx.okx.infoStats(String(CHAIN_ID), 30);
  const okbUsd = await getCachedOkbPrice(ctx);
  for (const it of items) {
    const date = it.date.slice(0, 10);
    if (!date) continue;
    await ctx.db
      .insert(dailyStats)
      .values({
        date,
        newAddresses:
          it.newAddressCount !== null ? BigInt(it.newAddressCount) : null,
        txCount:
          it.totalTransactionCount !== null
            ? BigInt(it.totalTransactionCount)
            : null,
        contractCalls:
          it.totalContractCalls !== null
            ? BigInt(it.totalContractCalls)
            : null,
        feeOkb: it.transactionFee !== null ? String(it.transactionFee) : null,
        feeUsd:
          it.transactionFee !== null && okbUsd !== null
            ? (it.transactionFee * okbUsd).toFixed(6)
            : null,
        utilization:
          it.networkUtilization !== null
            ? String(it.networkUtilization)
            : null,
        source: "okx-stats",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: dailyStats.date,
        set: {
          newAddresses: sql`excluded.new_addresses`,
          txCount: sql`excluded.tx_count`,
          contractCalls: sql`excluded.contract_calls`,
          feeOkb: sql`excluded.fee_okb`,
          feeUsd: sql`excluded.fee_usd`,
          utilization: sql`excluded.utilization`,
          source: "okx-stats",
          updatedAt: new Date(),
        },
      });
  }
}

// TODO(okx): confirm block-list param and response field shapes; failures
// here must only be logged, never crash the process.
export async function computeDailyStatsFromBlocks(
  ctx: CollectorCtx,
): Promise<void> {
  try {
    const blocks = await ctx.okx.blockList(String(CHAIN_ID));
    const existing = await ctx.db
      .select({ date: dailyStats.date })
      .from(dailyStats);
    const have = new Set(existing.map((r) => r.date));
    const byDay = new Map<string, { txCount: number; feeOkb: number }>();
    for (const b of blocks) {
      const bt = Number(
        (b as Record<string, unknown>).blockTime ??
          (b as Record<string, unknown>).timestamp ??
          0,
      );
      if (!bt) continue;
      const day = new Date(bt).toISOString().slice(0, 10);
      const agg = byDay.get(day) ?? { txCount: 0, feeOkb: 0 };
      agg.txCount += Number(
        (b as Record<string, unknown>).transactionCount ??
          (b as Record<string, unknown>).txCount ??
          0,
      );
      agg.feeOkb += Number(
        (b as Record<string, unknown>).totalFee ??
          (b as Record<string, unknown>).fee ??
          0,
      );
      byDay.set(day, agg);
    }
    const okbUsd = await getCachedOkbPrice(ctx);
    let derived = 0;
    for (const [day, agg] of byDay) {
      if (have.has(day)) continue;
      await ctx.db
        .insert(dailyStats)
        .values({
          date: day,
          txCount: BigInt(agg.txCount),
          feeOkb: String(agg.feeOkb),
          feeUsd: okbUsd !== null ? (agg.feeOkb * okbUsd).toFixed(6) : null,
          source: "okx-blocks",
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      derived++;
    }
    jobLog(
      "info",
      "daily-stats",
      `block-derived stats: ${derived} day(s) upserted of ${byDay.size} bucketed`,
    );
  } catch (err) {
    jobLog("warn", "daily-stats", "block-derived stats failed", err);
  }
}

export async function syncSummary(ctx: CollectorCtx): Promise<void> {
  const data = await ctx.okx.infoSummary(String(CHAIN_ID));
  await setCollectorState(ctx.db, "summary", {
    at: new Date().toISOString(),
    data,
  });
}

export async function syncOkbPrice(ctx: CollectorCtx): Promise<void> {
  const price = await ctx.okx.currentPrice(String(CHAIN_ID), "");
  if (price !== null) {
    await setCollectorState(ctx.db, "okb_price", {
      usd: price,
      at: new Date().toISOString(),
    });
  }
}

export async function dispatchAlerts(
  ctx: CollectorCtx,
  newTransfers: AlertableTransfer[],
  activeAlerts?: AlertRow[],
): Promise<void> {
  const active = activeAlerts ?? (await loadActiveAlerts(ctx));
  if (!active.length || !newTransfers.length) return;

  for (const t of newTransfers) {
    for (const a of active) {
      if (Number(t.amount) < Number(a.minUsd)) continue;
      const already = await ctx.db
        .select({ alertId: alertDeliveries.alertId })
        .from(alertDeliveries)
        .where(
          sql`${alertDeliveries.alertId} = ${a.id} and ${alertDeliveries.txHash} = ${t.txHash} and ${alertDeliveries.logIndex} = ${t.logIndex}`,
        )
        .limit(1);
      if (already.length) continue;
      const event = {
        metric: "whale-transfers",
        txHash: t.txHash,
        token: "USDT0",
        from: t.from,
        to: t.to,
        amountUsd: Number(t.amount),
        timestamp: t.ts.toISOString(),
        chainId: CHAIN_ID,
        explorerUrl: `${EXPLORER_BASE}/tx/${t.txHash}`,
      };
      let status: number | null = null;
      try {
        const res = await fetch(a.webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(5_000),
        });
        status = res.status;
        if (!res.ok) {
          await ctx.db
            .update(alerts)
            .set({ failures: a.failures + 1 })
            .where(sql`${alerts.id} = ${a.id}`);
        }
      } catch (err) {
        jobLog("warn", "alerts", "webhook delivery failed", err);
        await ctx.db
          .update(alerts)
          .set({ failures: a.failures + 1 })
          .where(sql`${alerts.id} = ${a.id}`);
      }
      await ctx.db
        .insert(alertDeliveries)
        .values({
          alertId: a.id,
          txHash: t.txHash,
          logIndex: t.logIndex,
          statusCode: status,
        })
        .onConflictDoNothing();
    }
  }
}

export function startCollector(ctx: CollectorCtx): CollectorHandle {
  const tasks: ScheduledTask[] = [];

  const jobs: Record<string, () => Promise<void>> = {
    "usdt0-logs": () => syncUsdt0Logs(ctx),
    summary: async () => {
      if (!ctx.env.okxConfigured) {
        jobLog("info", "summary", "OKX not configured, skipping");
        return;
      }
      await syncSummary(ctx);
    },
    "okb-price": async () => {
      if (!ctx.env.okxConfigured) {
        jobLog("info", "okb-price", "OKX not configured, skipping");
        return;
      }
      await syncOkbPrice(ctx);
    },
    "daily-stats": async () => {
      if (!ctx.env.okxConfigured) {
        jobLog("info", "daily-stats", "OKX not configured, skipping");
        return;
      }
      await syncDailyStats(ctx);
    },
  };

  const wrapped = Object.fromEntries(
    Object.entries(jobs).map(([k, v]) => [k, wrap(ctx, k, v)]),
  );

  void (async () => {
    await wrap(ctx, "chain-support", async () => {
      await checkChainSupport(ctx);
    })();
    for (const fn of Object.values(wrapped)) void fn();
  })();

  tasks.push(cron.schedule("*/10 * * * *", wrapped["usdt0-logs"]!));
  tasks.push(cron.schedule("*/10 * * * *", wrapped["summary"]!));
  tasks.push(cron.schedule("*/10 * * * *", wrapped["okb-price"]!));
  tasks.push(cron.schedule("0 */6 * * *", wrapped["daily-stats"]!));

  return {
    stop() {
      for (const t of tasks) void t.stop();
    },
    lastRunAt() {
      return lastRun;
    },
  };
}
