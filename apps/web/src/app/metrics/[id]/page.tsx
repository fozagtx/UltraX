import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDailySeries,
  getWhaleTransfers,
  getCache,
  getCollectorState,
  METRIC_CATALOG,
  type SeriesPoint,
} from "@ultrax/metrics";
import { getDb } from "@/lib/db";
import MetricChart, { type ChartPoint } from "@/components/MetricChart";
import RangeToggle from "@/components/RangeToggle";
import CurlBlock from "@/components/CurlBlock";
import EmptyState from "@/components/EmptyState";
import SourceLine from "@/components/SourceLine";
import RelativeTime from "@/components/RelativeTime";
import { AddressLink, TxLink } from "@/components/AddressLink";
import { usd, thousands } from "@/lib/format";
import type { WhaleItem } from "@/components/WhaleFeed";

export const dynamic = "force-dynamic";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const SOURCE_BY_METRIC: Record<string, string> = {
  "new-addresses": "Source: OKX Onchain OS · info/stats",
  "tx-count": "Source: OKX Onchain OS · info/stats",
  fees: "Source: OKX Onchain OS · info/stats",
  "stablecoin-volume": "Source: X Layer RPC · USDT0 Transfer logs",
  "stablecoin-netflow": "Source: X Layer RPC · USDT0 Transfer logs",
  "whale-transfers": "Source: X Layer RPC · USDT0 Transfer logs",
  "holder-concentration": "Source: OKX Onchain OS · dex/market top-holders",
};

export default async function MetricDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const meta = METRIC_CATALOG.find((m) => m.id === id);
  if (!meta) notFound();
  const days = sp.days === "7" ? 7 : 30;
  const db = getDb();

  let sourceLine = SOURCE_BY_METRIC[id] ?? "";
  if (id === "stablecoin-volume" || id === "stablecoin-netflow") {
    const state = (await getCollectorState(db, "usdt0_logs").catch(
      () => null,
    )) as { source?: string } | null;
    sourceLine =
      state?.source === "okx"
        ? "Source: OKX Onchain OS · log/by-address-and-topic"
        : "Source: X Layer RPC · USDT0 Transfer logs (OKX log/by-address-and-topic when available)";
  }

  const curl = `curl -i "${API_BASE}${meta.path}${meta.params.some((p) => p.name === "days") ? "?days=7" : ""}"
# 402 Payment Required + PAYMENT-REQUIRED header (x402, exact scheme, USDT0 on X Layer). Price: $${meta.priceUsd.toFixed(2)} per call.`;

  let body: React.ReactNode = null;
  let updatedAt: string | null = null;
  let partial = false;

  if (id === "whale-transfers") {
    const res = await getWhaleTransfers(db, { limit: 50 }).catch(() => null);
    const items = (res?.items ?? []) as WhaleItem[];
    body = items.length ? (
      <div
        className="overflow-x-auto rounded-lg border"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">From</th>
              <th className="px-4 py-2">To</th>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Tx</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={`${t.txHash}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="mono px-4 py-2" style={{ fontFamily: "var(--font-mono)" }}>
                  {usd(t.amountUsd)}
                </td>
                <td className="px-4 py-2"><AddressLink address={t.from} /></td>
                <td className="px-4 py-2"><AddressLink address={t.to} /></td>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--muted)" }}>
                  <RelativeTime iso={t.timestamp} />
                </td>
                <td className="px-4 py-2"><TxLink hash={t.txHash} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <EmptyState message="No transfers indexed yet. The collector fills this from USDT0 Transfer logs." />
    );
  } else if (id === "holder-concentration") {
    const cached = (await getCache(db, "holder-concentration:usdt0").catch(
      () => null,
    )) as {
      top10Pct?: number | null;
      top50Pct?: number | null;
      top100Pct?: number | null;
      top20Pct?: number | null;
      source?: string;
      updatedAt?: string;
    } | null;
    body = cached ? (
      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <p className="mb-3 text-sm">
          USDT0 holder concentration{" "}
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            via {cached.source}
          </span>
        </p>
        {[
          ["Top 10", cached.top10Pct],
          ["Top 20", cached.top20Pct],
          ["Top 50", cached.top50Pct],
          ["Top 100", cached.top100Pct],
        ]
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([label, v]) => (
            <div key={label as string} className="mb-2">
              <div className="mb-1 flex justify-between text-xs" style={{ color: "var(--muted)" }}>
                <span>{label}</span>
                <span className="mono">{Number(v).toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded" style={{ background: "var(--bg)" }}>
                <div
                  className="h-2 rounded"
                  style={{ width: `${Math.min(100, Number(v))}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
          ))}
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          Look up another token on the{" "}
          <Link href="/token" className="hover:text-[var(--accent)]">
            token page
          </Link>
          .
        </p>
      </div>
    ) : (
      <EmptyState message="Not fetched yet. Holder concentration is fetched on demand through the paid API, or via the token lookup page." />
    );
  } else {
    const res = await getDailySeries(db, id, days).catch(() => null);
    updatedAt = res?.updatedAt ?? null;
    const data: ChartPoint[] = (res?.series ?? []).map((p: SeriesPoint) => ({
      date: p.date,
      value: p.value,
      partial: Boolean(p.partial),
      partialReason: p.partialReason as string | undefined,
    }));
    partial = data.at(-1)?.partial ?? false;
    body = data.length ? (
      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="mb-3 flex justify-end">
          <RangeToggle base={`/metrics/${id}`} current={days} />
        </div>
        <MetricChart data={data} unit={meta.unit} />
      </div>
    ) : (
      <EmptyState />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-medium">{meta.name}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {meta.description}
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm sm:grid-cols-4"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>Unit</div>
          <div className="mono mt-1">{meta.unit}</div>
        </div>
        <div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>Price</div>
          <div className="mono mt-1">${meta.priceUsd.toFixed(2)} / call</div>
        </div>
        <div className="col-span-2">
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Data source
          </div>
          <div className="mono mt-1 text-xs">{meta.okxSource}</div>
        </div>
      </div>

      {body}
      <SourceLine
        source={sourceLine}
        updatedAt={updatedAt}
        partial={partial}
      />

      <div>
        <h2 className="mb-1 text-sm font-medium">How it is computed</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {meta.computeNote}
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">API access</h2>
        <CurlBlock text={curl} />
      </div>
    </div>
  );
}
