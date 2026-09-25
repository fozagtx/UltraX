import Link from "next/link";
import { sql } from "drizzle-orm";
import {
  getDailySeries,
  getKpis,
  getStablecoinKpis,
  getWhaleTransfers,
  getLargestTransfers24h,
  getCache,
  METRIC_CATALOG,
  WHALE_MIN_USD,
  type SeriesPoint,
} from "@ultrax/metrics";
import { getDb } from "@/lib/db";
import { Page, PageHeader } from "@/components/app-shell";
import KpiCard from "@/components/KpiCard";
import MetricChart, { type ChartPoint } from "@/components/MetricChart";
import WhaleFeed, { type WhaleItem } from "@/components/WhaleFeed";
import EmptyState from "@/components/EmptyState";
import SourceLine from "@/components/SourceLine";
import { compact, usd, usdCompact, okb, thousands } from "@/lib/format";

export const dynamic = "force-dynamic";

const SERIES_IDS = [
  "new-addresses",
  "tx-count",
  "fees",
  "stablecoin-volume",
  "stablecoin-netflow",
] as const;

const SOURCE_BY_METRIC: Record<string, string> = {
  "new-addresses": "Source: OKX Onchain OS · info/stats",
  "tx-count": "Source: OKX Onchain OS · info/stats",
  fees: "Source: OKX Onchain OS · info/stats",
  "stablecoin-volume": "Source: X Layer RPC · USDT0 Transfer logs",
  "stablecoin-netflow": "Source: X Layer RPC · USDT0 Transfer logs",
};

interface KpiEntry {
  latest: number | null;
  asOfDate?: string | null;
  partial?: boolean;
  change7dPct: number | null;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const metricId = (SERIES_IDS as readonly string[]).includes(sp.m ?? "")
    ? (sp.m as string)
    : "stablecoin-volume";
  const range = sp.range === "30" ? 30 : 7;
  const db = getDb();

  const [kpis, stable24h, whales, largest24h, holderCache, series, totalRows] =
    await Promise.all([
      getKpis(db).catch(() => null),
      getStablecoinKpis(db).catch(() => null),
      getWhaleTransfers(db, { minUsd: WHALE_MIN_USD, limit: 15 }).catch(
        () => null,
      ),
      getLargestTransfers24h(db, 15).catch(() => [] as unknown[]),
      getCache(db, "holder-concentration:usdt0").catch(() => null),
      getDailySeries(db, metricId, range).catch(() => null),
      db
        .execute<{ n: string }>(sql`select count(*) as n from transfers`)
        .then((r) => Number(r.rows[0]?.n ?? 0))
        .catch(() => 0),
    ]);

  const metrics = (kpis?.metrics ?? {}) as Record<string, KpiEntry>;

  const whale24hCount = await db
    .execute<{ n: string }>(
      sql`select count(*) as n from transfers where amount >= ${WHALE_MIN_USD} and ts > now() - interval '24 hours'`,
    )
    .then((r) => Number(r.rows[0]?.n ?? 0))
    .catch(() => 0);

  const meta = METRIC_CATALOG.find((m) => m.id === metricId)!;
  const chartData: ChartPoint[] = (series?.series ?? []).map(
    (p: SeriesPoint) => ({
      date: p.date,
      value: p.value,
      partial: Boolean(p.partial),
      partialReason: p.partialReason as string | undefined,
    }),
  );
  const lastPartial = chartData.at(-1)?.partial ?? false;

  const whaleItems = (whales?.items ?? []) as WhaleItem[];
  const feedIsFallback = whaleItems.length < 3;
  const feedItems = feedIsFallback ? (largest24h as WhaleItem[]) : whaleItems;
  const feedTitle = feedIsFallback
    ? "Largest transfers, 24h"
    : "Whale feed (≥ $100k)";

  const holder = holderCache as { top10Pct?: number } | null;
  const holderKnown =
    holder?.top10Pct !== undefined && holder.top10Pct !== null;

  const numEntry = (id: string, format: (n: number) => string) => {
    const e = metrics[id];
    const known = e?.latest !== null && e?.latest !== undefined;
    return {
      value: known ? format(e.latest as number) : null,
      valueTitle: known ? thousands(e.latest as number) : undefined,
      caption: known
        ? e.partial && e.asOfDate
          ? `partial day · ${e.asOfDate}`
          : e.asOfDate || undefined
        : "via OKX info/stats, needs API key",
      changePct: e?.change7dPct ?? null,
    };
  };

  const cards: {
    id: string;
    label: string;
    value: string | null;
    valueTitle?: string;
    caption?: string;
    changePct: number | null;
  }[] = [
    {
      id: "new-addresses",
      label: "New addresses",
      ...numEntry("new-addresses", compact),
    },
    { id: "tx-count", label: "Transactions", ...numEntry("tx-count", compact) },
    {
      id: "fees",
      label: "Fees",
      ...numEntry("fees", (n) => `${compact(n)} OKB`),
      valueTitle:
        metrics["fees"]?.latest !== null &&
        metrics["fees"]?.latest !== undefined
          ? okb(metrics["fees"].latest)
          : undefined,
    },
    {
      id: "stablecoin-volume",
      label: "USDT0 volume",
      ...numEntry("stablecoin-volume", usdCompact),
      caption:
        metrics["stablecoin-volume"]?.latest != null
          ? metrics["stablecoin-volume"].partial &&
            metrics["stablecoin-volume"].asOfDate
            ? `partial day · ${metrics["stablecoin-volume"].asOfDate}`
            : `as of ${metrics["stablecoin-volume"].asOfDate}`
          : undefined,
      valueTitle:
        metrics["stablecoin-volume"]?.latest != null
          ? usd(metrics["stablecoin-volume"].latest)
          : undefined,
    },
    {
      id: "stablecoin-netflow",
      label: "USDT0 netflow",
      ...numEntry("stablecoin-netflow", usdCompact),
      caption:
        metrics["stablecoin-netflow"]?.latest != null
          ? metrics["stablecoin-netflow"].partial &&
            metrics["stablecoin-netflow"].asOfDate
            ? `partial day · ${metrics["stablecoin-netflow"].asOfDate}`
            : `as of ${metrics["stablecoin-netflow"].asOfDate}`
          : undefined,
      valueTitle:
        metrics["stablecoin-netflow"]?.latest != null
          ? usd(metrics["stablecoin-netflow"].latest)
          : undefined,
    },
    {
      id: "whale-transfers",
      label: "Whale transfers ≥$100k",
      value: thousands(whale24hCount),
      caption: "last 24h",
      changePct: null,
    },
    {
      id: "holder-concentration",
      label: "USDT0 concentration",
      value: holderKnown ? `${Number(holder!.top10Pct).toFixed(1)}%` : null,
      caption: holderKnown ? "top-10 share" : "look up on Token page",
      changePct: null,
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="X Layer · chain 196"
        title="Overview"
        description="Daily network metrics and USDT0 flows, straight from the indexer database."
        action={
          <span className="rounded-full border border-border bg-card px-3 py-1 font-mono text-xs tabular-nums text-muted-foreground">
            {compact(totalRows)} transfers indexed
          </span>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <KpiCard
            key={c.id}
            label={c.label}
            value={c.value}
            valueTitle={c.valueTitle}
            caption={c.caption}
            changePct={c.changePct}
            href={`/metrics/${c.id}`}
          />
        ))}
      </section>

      {stable24h ? (
        <section className="flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-xs text-muted-foreground">
            last 24h (rolling)
          </span>
          <span className="font-mono tabular-nums">
            volume {usd(stable24h.volumeUsd)}
          </span>
          <span className="font-mono tabular-nums">
            netflow {usd(stable24h.netflowUsd)}
          </span>
          <span className="font-mono tabular-nums">
            transfers {stable24h.transferCount.toLocaleString("en-US")}
          </span>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {SERIES_IDS.map((id) => (
                <Link
                  key={id}
                  href={`/overview?m=${id}&range=${range}`}
                  className={`px-2 py-0.5 text-xs ${
                    id === metricId
                      ? "border-b border-primary text-primary"
                      : "border-b border-transparent text-muted-foreground"
                  }`}
                >
                  {METRIC_CATALOG.find((m) => m.id === id)?.name}
                </Link>
              ))}
            </div>
            <div className="flex gap-1">
              {[7, 30].map((d) => (
                <Link
                  key={d}
                  href={`/overview?m=${metricId}&range=${d}`}
                  className={`px-2 py-0.5 font-mono text-xs tabular-nums ${
                    d === range
                      ? "border-b border-primary text-primary"
                      : "border-b border-transparent text-muted-foreground"
                  }`}
                >
                  {d}d
                </Link>
              ))}
            </div>
          </div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">
              {meta.name}{" "}
              <span className="font-mono text-xs text-muted-foreground">
                {meta.unit}
              </span>
            </h2>
          </div>
          {chartData.length ? (
            <MetricChart data={chartData} unit={meta.unit} />
          ) : (
            <EmptyState />
          )}
          <div className="mt-3">
            <SourceLine
              source={SOURCE_BY_METRIC[metricId] ?? ""}
              updatedAt={series?.updatedAt ?? null}
              partial={lastPartial}
            />
          </div>
        </div>
        <WhaleFeed title={feedTitle} items={feedItems.slice(0, 15)} />
      </section>
    </Page>
  );
}
