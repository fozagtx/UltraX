import { desc, gte, lte, asc, eq, sql, and, gt } from "drizzle-orm";
import type { Db } from "./db.js";
import {
  dailyStats,
  dailyStablecoin,
  transfers,
  cache,
  collectorState,
} from "./schema.js";
import {
  METRIC_CATALOG,
  CHAIN_ID,
  WHALE_MIN_USD,
  ZERO_ADDRESS,
} from "./catalog.js";
import { utcDayOffset, utcToday, pctChange } from "./pure.js";

const SERIES_METRICS = [
  "new-addresses",
  "tx-count",
  "fees",
  "stablecoin-volume",
  "stablecoin-netflow",
] as const;

type SeriesMetricId = (typeof SERIES_METRICS)[number];

const STABLECOIN_METRICS = new Set<string>([
  "stablecoin-volume",
  "stablecoin-netflow",
]);

// Earliest timestamp covered by the transfers table; daily rows whose UTC
// day starts before this are only partially covered by the indexer.
async function getCoverageStartMs(db: Db): Promise<number | null> {
  const rows = await db.execute<{ min_ts: string | null }>(
    sql`select min(ts) as min_ts from transfers`,
  );
  const v = rows.rows[0]?.min_ts;
  return v ? new Date(v).getTime() : null;
}

function metricMeta(metricId: string) {
  const m = METRIC_CATALOG.find((x) => x.id === metricId);
  if (!m) throw new Error(`unknown metric: ${metricId}`);
  return m;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface SeriesPoint {
  date: string;
  value: number | null;
  [k: string]: unknown;
}

export async function getDailySeries(
  db: Db,
  metricId: string,
  days: number,
): Promise<{
  metric: string;
  chain: string;
  chainId: number;
  unit: string;
  updatedAt: string | null;
  coverageStart: string | null;
  series: SeriesPoint[];
}> {
  const meta = metricMeta(metricId);
  const since = utcDayOffset(days - 1);
  const today = utcToday();
  let series: SeriesPoint[] = [];
  let updatedAt: Date | null = null;
  let coverageStart: string | null = null;

  if (STABLECOIN_METRICS.has(metricId)) {
    const coverageStartMs = await getCoverageStartMs(db);
    coverageStart = coverageStartMs
      ? new Date(coverageStartMs).toISOString()
      : null;
    const partialFlags = (r: { date: string }): Partial<SeriesPoint> => {
      if (r.date === today)
        return { partial: true, partialReason: "today" };
      if (
        coverageStartMs !== null &&
        Date.parse(`${r.date}T00:00:00Z`) < coverageStartMs
      )
        return { partial: true, partialReason: "coverage" };
      return {};
    };
    const rows = await db
      .select()
      .from(dailyStablecoin)
      .where(gte(dailyStablecoin.date, since))
      .orderBy(asc(dailyStablecoin.date));
    updatedAt = rows.reduce<Date | null>(
      (m, r) => (r.updatedAt && (!m || r.updatedAt > m) ? r.updatedAt : m),
      null,
    );
    series = rows.map((r) => ({
      date: r.date,
      value:
        metricId === "stablecoin-volume"
          ? num(r.volumeUsd)
          : num(r.netflowUsd),
      volumeUsd: num(r.volumeUsd),
      mintUsd: num(r.mintUsd),
      burnUsd: num(r.burnUsd),
      transferCount: r.transferCount,
      ...partialFlags(r),
    }));
  } else {
    const rows = await db
      .select()
      .from(dailyStats)
      .where(gte(dailyStats.date, since))
      .orderBy(asc(dailyStats.date));
    updatedAt = rows.reduce<Date | null>(
      (m, r) => (r.updatedAt && (!m || r.updatedAt > m) ? r.updatedAt : m),
      null,
    );
    const withPartial = (p: SeriesPoint, date: string): SeriesPoint =>
      date === today ? { ...p, partial: true } : p;
    if (metricId === "new-addresses") {
      series = rows.map((r) =>
        withPartial({ date: r.date, value: num(r.newAddresses) }, r.date),
      );
    } else if (metricId === "tx-count") {
      series = rows.map((r) =>
        withPartial(
          {
            date: r.date,
            value: num(r.txCount),
            contractCalls: num(r.contractCalls),
          },
          r.date,
        ),
      );
    } else {
      series = rows.map((r) =>
        withPartial(
          {
            date: r.date,
            value: num(r.feeOkb),
            feeUsd: num(r.feeUsd),
            utilization: num(r.utilization),
          },
          r.date,
        ),
      );
    }
  }

  return {
    metric: metricId,
    chain: "xlayer",
    chainId: CHAIN_ID,
    unit: meta.unit,
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
    coverageStart,
    series,
  };
}

export async function getWhaleTransfers(
  db: Db,
  opts: { minUsd?: number; limit?: number } = {},
): Promise<{ metric: string; items: unknown[] }> {
  const minUsd = opts.minUsd ?? WHALE_MIN_USD;
  const limit = opts.limit ?? 20;
  const rows = await db
    .select()
    .from(transfers)
    .where(gte(transfers.amount, String(minUsd)))
    .orderBy(desc(transfers.ts))
    .limit(limit);
  return {
    metric: "whale-transfers",
    items: rows.map((r) => ({
      txHash: r.txHash,
      token: r.token,
      from: r.fromAddr,
      to: r.toAddr,
      amountUsd: num(r.amount),
      timestamp: r.ts.toISOString(),
      blockNumber: Number(r.blockNumber),
    })),
  };
}

async function latestAndPrev(
  db: Db,
  metricId: SeriesMetricId,
): Promise<{
  latest: number | null;
  latestDate: string | null;
  latestPartial: boolean;
  prev7: number | null;
  prev7Date: string | null;
}> {
  const empty = {
    latest: null,
    latestDate: null,
    latestPartial: false,
    prev7: null,
    prev7Date: null,
  };
  const yesterday = utcDayOffset(1);
  const isStablecoin = STABLECOIN_METRICS.has(metricId);
  const table = isStablecoin ? dailyStablecoin : dailyStats;
  const coverageStartMs = isStablecoin ? await getCoverageStartMs(db) : null;
  const val = (r: Record<string, unknown>): number | null => {
    if (metricId === "new-addresses") return num(r.newAddresses);
    if (metricId === "tx-count") return num(r.txCount);
    if (metricId === "fees") return num(r.feeOkb);
    if (metricId === "stablecoin-volume") return num(r.volumeUsd);
    return num(r.netflowUsd);
  };
  const rows = await db
    .select()
    .from(table)
    .where(lte(table.date, yesterday))
    .orderBy(desc(table.date))
    .limit(60);
  if (rows.length === 0) return empty;
  let latestRow = rows[0] as Record<string, unknown>;
  let latestPartial = false;
  if (isStablecoin && coverageStartMs !== null) {
    const complete = rows.find(
      (r) =>
        Date.parse(`${String((r as Record<string, unknown>).date)}T00:00:00Z`) >=
        coverageStartMs,
    );
    if (complete) {
      latestRow = complete as Record<string, unknown>;
    } else {
      latestPartial = true;
    }
  }
  const latestDate = String(latestRow.date);
  const prev7Date = new Date(
    Date.parse(`${latestDate}T00:00:00Z`) - 7 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  const prevRows = await db
    .select()
    .from(table)
    .where(eq(table.date, prev7Date))
    .limit(1);
  return {
    latest: val(latestRow),
    latestDate,
    latestPartial,
    prev7: prevRows.length ? val(prevRows[0] as Record<string, unknown>) : null,
    prev7Date: prevRows.length ? prev7Date : null,
  };
}

export async function getSnapshot(db: Db): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { metrics: {} };
  const metrics = out.metrics as Record<string, unknown>;
  let newest: Date | null = null;
  let asOfDate: string | null = null;
  for (const id of SERIES_METRICS) {
    const { latest, latestDate, latestPartial, prev7 } = await latestAndPrev(
      db,
      id,
    );
    metrics[id] = {
      latest,
      asOfDate: latestDate,
      partial: latestPartial,
      change7dPct:
        latest !== null && prev7 !== null ? pctChange(latest, prev7) : null,
    };
    if (latestDate && (!asOfDate || latestDate > asOfDate))
      asOfDate = latestDate;
  }
  const coverageStartMs = await getCoverageStartMs(db);
  const whales = await getWhaleTransfers(db, {
    minUsd: WHALE_MIN_USD,
    limit: 1,
  });
  out.latestWhaleTransfer = (whales.items as unknown[])[0] ?? null;
  const holder = await getCache(db, `holder-concentration:usdt0`);
  metrics["holder-concentration"] = holder ?? null;
  const ts = await db
    .select({ updatedAt: dailyStats.updatedAt })
    .from(dailyStats)
    .orderBy(desc(dailyStats.date))
    .limit(1);
  newest = ts[0]?.updatedAt ?? null;
  const ts2 = await db
    .select({ updatedAt: dailyStablecoin.updatedAt })
    .from(dailyStablecoin)
    .orderBy(desc(dailyStablecoin.date))
    .limit(1);
  if (ts2[0]?.updatedAt && (!newest || ts2[0].updatedAt > newest))
    newest = ts2[0].updatedAt;
  out.metric = "snapshot";
  out.chain = "xlayer";
  out.chainId = CHAIN_ID;
  out.asOfDate = asOfDate;
  out.coverageStart = coverageStartMs
    ? new Date(coverageStartMs).toISOString()
    : null;
  out.updatedAt = newest ? newest.toISOString() : null;
  return out;
}

export async function getKpis(db: Db): Promise<Record<string, unknown>> {
  const metrics: Record<string, unknown> = {};
  let asOfDate: string | null = null;
  for (const id of SERIES_METRICS) {
    const { latest, latestDate, latestPartial, prev7, prev7Date } =
      await latestAndPrev(db, id);
    metrics[id] = {
      latest,
      asOfDate: latestDate,
      partial: latestPartial,
      previous7dAgo: prev7,
      prev7Date,
      change7dPct:
        latest !== null && prev7 !== null ? pctChange(latest, prev7) : null,
    };
    if (latestDate && (!asOfDate || latestDate > asOfDate))
      asOfDate = latestDate;
  }
  const whales = await getWhaleTransfers(db, {
    minUsd: WHALE_MIN_USD,
    limit: 1,
  });
  metrics["whale-transfers"] = { latest: (whales.items as unknown[])[0] ?? null };
  return { metrics, asOfDate, updatedAt: new Date().toISOString() };
}

export async function getRecentTransfers(
  db: Db,
  limit = 50,
): Promise<unknown[]> {
  const rows = await db
    .select()
    .from(transfers)
    .orderBy(desc(transfers.ts))
    .limit(limit);
  return rows.map((r) => ({
    txHash: r.txHash,
    token: r.token,
    from: r.fromAddr,
    to: r.toAddr,
    amountUsd: num(r.amount),
    timestamp: r.ts.toISOString(),
    blockNumber: Number(r.blockNumber),
  }));
}

export async function getLargestTransfers24h(
  db: Db,
  limit = 15,
): Promise<unknown[]> {
  const rows = await db
    .select()
    .from(transfers)
    .where(sql`ts > now() - interval '24 hours'`)
    .orderBy(desc(transfers.amount))
    .limit(limit);
  return rows.map((r) => ({
    txHash: r.txHash,
    token: r.token,
    from: r.fromAddr,
    to: r.toAddr,
    amountUsd: num(r.amount),
    timestamp: r.ts.toISOString(),
    blockNumber: Number(r.blockNumber),
  }));
}

export async function getStablecoinKpis(db: Db): Promise<{
  window: string;
  volumeUsd: number;
  mintUsd: number;
  burnUsd: number;
  netflowUsd: number;
  transferCount: number;
  updatedAt: string;
}> {
  const rows = await db.execute<{
    volume: string | null;
    mint: string | null;
    burn: string | null;
    count: string | null;
  }>(sql`
    select
      coalesce(sum(amount), 0) as volume,
      coalesce(sum(amount) filter (where from_addr = ${ZERO_ADDRESS}), 0) as mint,
      coalesce(sum(amount) filter (where to_addr = ${ZERO_ADDRESS}), 0) as burn,
      count(*) as count
    from transfers
    where ts > now() - interval '24 hours'
  `);
  const r = rows.rows[0] ?? { volume: "0", mint: "0", burn: "0", count: "0" };
  const mint = num(r.mint) ?? 0;
  const burn = num(r.burn) ?? 0;
  return {
    window: "24h",
    volumeUsd: num(r.volume) ?? 0,
    mintUsd: mint,
    burnUsd: burn,
    netflowUsd: mint - burn,
    transferCount: Number(r.count ?? 0),
    updatedAt: new Date().toISOString(),
  };
}

export async function getCollectorState(
  db: Db,
  key: string,
): Promise<unknown | null> {
  const rows = await db
    .select()
    .from(collectorState)
    .where(eq(collectorState.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setCollectorState(
  db: Db,
  key: string,
  value: unknown,
): Promise<void> {
  await db
    .insert(collectorState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: collectorState.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function setCache(
  db: Db,
  key: string,
  json: unknown,
  ttlSeconds: number,
): Promise<void> {
  await db
    .insert(cache)
    .values({
      key,
      json,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    })
    .onConflictDoUpdate({
      target: cache.key,
      set: { json, expiresAt: new Date(Date.now() + ttlSeconds * 1000) },
    });
}

export async function getCache(db: Db, key: string): Promise<unknown | null> {
  const rows = await db
    .select()
    .from(cache)
    .where(and(eq(cache.key, key), gt(cache.expiresAt, sql`now()`)))
    .limit(1);
  return rows[0]?.json ?? null;
}
