import Link from "next/link";
import { sql } from "drizzle-orm";
import {
  getWhaleTransfers,
  getLargestTransfers24h,
  getStablecoinKpis,
  ALL_ENDPOINTS,
  METRIC_CATALOG,
  EXPLORER_BASE,
  WHALE_MIN_USD,
} from "@ultrax/metrics";
import { getDb } from "@/lib/db";
import { SiteHeader } from "@/components/site-header";
import { BackgroundSwitcher } from "@/components/background-switcher";
import { ArcBandsBackground } from "@/components/background-gradient/arc-bands-background";
import { SandDriftBackground } from "@/components/background-gradient/sand-drift-background";
import { Reveal, RevealLine } from "@/components/reveal";
import { CandyButton } from "@/components/ui/candy-button";
import { PhoneMockupCard } from "@/components/mockups/phone-mockup-card";
import RelativeTime from "@/components/RelativeTime";
import { truncateAddress, usd, usdCompact, compact } from "@/lib/format";
import type { WhaleItem } from "@/components/WhaleFeed";

export const dynamic = "force-dynamic";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export default async function LandingPage() {
  const db = getDb();
  const [whales, largest24h, stable24h, whaleCount] = await Promise.all([
    getWhaleTransfers(db, { minUsd: WHALE_MIN_USD, limit: 6 }).catch(
      () => null,
    ),
    getLargestTransfers24h(db, 6).catch(() => [] as unknown[]),
    getStablecoinKpis(db).catch(() => null),
    db
      .execute<{ n: string }>(
        sql`select count(*) as n from transfers where amount >= ${WHALE_MIN_USD} and ts > now() - interval '24 hours'`,
      )
      .then((r) => Number(r.rows[0]?.n ?? 0))
      .catch(() => 0),
  ]);

  const whaleItems = (whales?.items ?? []) as WhaleItem[];
  const feedIsFallback = whaleItems.length < 4;
  const feedItems = (
    feedIsFallback ? (largest24h as WhaleItem[]) : whaleItems
  ).slice(0, 6);
  const feedTitle = feedIsFallback
    ? "Largest transfers, 24h"
    : "ULTRA X alerts · webhook";

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 pt-4">
        <SiteHeader />
      </div>

      <BackgroundSwitcher
        backgrounds={[<ArcBandsBackground key="a" />, <SandDriftBackground key="b" />]}
        className="px-4"
        intervalMs={9000}
      >
        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-2 py-16 md:grid-cols-2 md:py-24">
          <Reveal>
            <RevealLine>
              <p className="font-mono text-xs tracking-widest text-muted-foreground">
                X LAYER · CHAIN 196
              </p>
            </RevealLine>
            <RevealLine index={1}>
              <h1 className="mt-3 text-balance text-4xl font-medium -tracking-[0.05em] md:text-5xl">
                On-chain intelligence for X Layer,{" "}
                <span className="text-primary">priced per call</span>.
              </h1>
            </RevealLine>
            <RevealLine index={2}>
              <p className="mt-4 max-w-md text-sm text-muted-foreground md:text-base">
                Seven daily metrics from OKX Onchain OS and X Layer RPC. One
                x402 API for agents, one dashboard for humans.
              </p>
            </RevealLine>
            <RevealLine index={3}>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/overview">
                  <CandyButton className="px-7 py-2.5 text-sm">
                    Open dashboard
                  </CandyButton>
                </Link>
                <Link
                  href="/agents"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Read the API →
                </Link>
              </div>
            </RevealLine>
          </Reveal>

          <div className="flex justify-center md:justify-end">
            <PhoneMockupCard variant="white" className="w-[240px]">
              <div className="flex h-full flex-col bg-white px-3 pt-10">
                <p className="font-mono text-[10px] tracking-wide text-muted-foreground">
                  {feedTitle}
                </p>
                <div className="mt-2 flex flex-col divide-y divide-border">
                  {feedItems.map((t) => (
                    <div key={t.txHash} className="py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-medium tabular-nums">
                          {usd(t.amountUsd)}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          <RelativeTime iso={t.timestamp} />
                        </span>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
                        {truncateAddress(t.from)} → {truncateAddress(t.to)}
                      </p>
                    </div>
                  ))}
                  {feedItems.length === 0 ? (
                    <p className="py-4 text-[10px] text-muted-foreground">
                      No transfers indexed yet.
                    </p>
                  ) : null}
                </div>
                <div className="mt-auto pb-8 pt-3">
                  <Link
                    href="/overview"
                    className="block rounded-full bg-[#1D1D1F] py-2 text-center text-[11px] font-semibold text-white"
                  >
                    View all transfers
                  </Link>
                </div>
              </div>
            </PhoneMockupCard>
          </div>
        </section>
      </BackgroundSwitcher>

      <section className="border-y border-border bg-card py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4">
          <span className="font-mono text-xs tracking-widest text-muted-foreground">
            WATCHING
          </span>
          {METRIC_CATALOG.map((m) => (
            <Link
              key={m.id}
              href={`/metrics/${m.id}`}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {m.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["USDT0 volume", stable24h ? usdCompact(stable24h.volumeUsd) : null],
            ["USDT0 netflow", stable24h ? usdCompact(stable24h.netflowUsd) : null],
            [
              "Transfers",
              stable24h ? compact(stable24h.transferCount) : null,
            ],
            ["Transfers ≥ $100k", String(whaleCount)],
          ].map(([label, v]) => (
            <div
              key={label as string}
              className="rounded-xl border border-border bg-card p-4"
            >
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 font-mono text-xl tabular-nums">
                {v ?? "No data yet"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                last 24h · rolling
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="text-lg font-medium">How agents pay</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            [
              "1 · Call",
              "Request any paid endpoint. You get HTTP 402 with a PAYMENT-REQUIRED header containing the price and payTo address.",
            ],
            [
              "2 · Pay",
              "Sign an exact-scheme USDT0 payment on X Layer for the quoted amount via the OKX Payment SDK / Onchain OS agent.",
            ],
            [
              "3 · Retry",
              "Send the same request with the PAYMENT-SIGNATURE header. The response is the JSON payload.",
            ],
          ].map(([t, d]) => (
            <div
              key={t as string}
              className="rounded-xl border border-border bg-card p-5"
            >
              <p className="font-mono text-xs text-primary">{t}</p>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-lg font-medium">Pricing</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-2">Endpoint</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="px-4 py-2 font-mono">/health</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  liveness, db, collector status
                </td>
                <td className="px-4 py-2 font-mono">free</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-4 py-2 font-mono">/catalog</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  machine-readable endpoint catalog
                </td>
                <td className="px-4 py-2 font-mono">free</td>
              </tr>
              {ALL_ENDPOINTS.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono">
                    {m.method} {m.path}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {m.description}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums">
                    ${m.priceUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 text-xs text-muted-foreground">
          <span className="font-mono">ULTRA X · X Layer · chain 196</span>
          <a
            href={`${API_BASE}/health`}
            className="transition-colors hover:text-primary"
          >
            /health
          </a>
          <a
            href={`${API_BASE}/catalog`}
            className="transition-colors hover:text-primary"
          >
            /catalog
          </a>
          <a
            href={EXPLORER_BASE}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-primary"
          >
            Explorer
          </a>
        </div>
      </footer>
    </div>
  );
}
