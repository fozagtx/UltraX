import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { BackgroundSwitcher } from "@/components/background-switcher";
import { ArcBandsBackground } from "@/components/background-gradient/arc-bands-background";
import { SandDriftBackground } from "@/components/background-gradient/sand-drift-background";
import { Reveal, RevealLine } from "@/components/reveal";
import { CandyButton } from "@/components/ui/candy-button";
import { PhoneMockupCard } from "@/components/mockups/phone-mockup-card";
import { ExampleCheckCard } from "@/components/verdict-card";
import { StatusBoard } from "@/components/status-board";
import { PaymentsRecent } from "@/components/payments-recent";
import { VerdictRules } from "@/components/verdict-rules";
import { RightsCard } from "@/components/rights-card";
import { CurlBlock } from "@/components/curl-block";
import {
  apiGet,
  PUBLIC_API_BASE,
  type CatalogResponse,
  type PaymentsResponse,
  type StatusResponse,
} from "@/lib/api";

export const dynamic = "force-dynamic";

const FALLBACK_RULES = [
  {
    verdict: "OK",
    condition:
      "Market open, token within 1% of the stock and OKX, exit returns >= 98% of size",
  },
  {
    verdict: "CAUTION",
    condition:
      "US market closed, gap 1-3% vs stock or OKX, or exit returns 90-98% of size",
  },
  {
    verdict: "STOP",
    condition:
      "A required source is missing or stale, gap > 3%, or exit returns < 90% of size",
  },
];

export default async function LandingPage() {
  const [status, payments, catalog] = await Promise.all([
    apiGet<StatusResponse>("/status"),
    apiGet<PaymentsResponse>("/payments/recent"),
    apiGet<CatalogResponse>("/catalog"),
  ]);

  const rules = catalog?.verdictRules ?? FALLBACK_RULES;
  const rights = catalog?.rights?.NVDAx ?? {
    type: "Tracker certificate, 1:1 backed",
    voting: false,
    dividends: "Reinvested through the token multiplier",
    redemption: "Eligible holders only, US business days",
    restricted: ["US", "EU", "CA", "UK", "AU"],
  };
  const restricted = catalog?.restricted ?? rights.restricted;
  const disclaimer =
    catalog?.disclaimer ?? "Information only, not investment advice.";
  const checkCurl = `curl -i -X POST ${PUBLIC_API_BASE}/check \\
  -H 'content-type: application/json' \\
  -d '{"ticker":"NVDAx","side":"sell","sizeUSD":500}'`;

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 pt-4">
        <SiteHeader />
      </div>

      <BackgroundSwitcher
        backgrounds={[
          <ArcBandsBackground key="a" />,
          <SandDriftBackground key="b" />,
        ]}
        className="px-4"
        intervalMs={9000}
      >
        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-2 py-16 md:grid-cols-2 md:py-24">
          <Reveal>
            <RevealLine>
              <p className="font-mono text-xs tracking-widest text-muted-foreground">
                X LAYER · xSTOCKS · x402
              </p>
            </RevealLine>
            <RevealLine index={1}>
              <h1 className="mt-3 text-balance text-4xl font-medium -tracking-[0.05em] md:text-5xl">
                Know what you hold{" "}
                <span className="text-primary">before you trade it</span>.
              </h1>
            </RevealLine>
            <RevealLine index={2}>
              <p className="mt-4 max-w-md text-sm text-muted-foreground md:text-base">
                A paid safety check agents call before trading tokenized
                stocks on X Layer. One verdict, four facts, 0.005 USDT per
                call.
              </p>
            </RevealLine>
            <RevealLine index={3}>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/docs">
                  <CandyButton className="px-7 py-2.5 text-sm">
                    Read the docs
                  </CandyButton>
                </Link>
                <a
                  href="#try"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Try the unpaid call →
                </a>
              </div>
            </RevealLine>
          </Reveal>

          <div className="flex justify-center md:justify-end">
            <PhoneMockupCard variant="white" className="w-[240px]">
              <ExampleCheckCard />
            </PhoneMockupCard>
          </div>
        </section>
      </BackgroundSwitcher>

      <main className="mx-auto max-w-6xl space-y-16 px-4 pb-20">
        <section>
          <h2 className="text-xl font-medium -tracking-[0.02em]">
            Live status
          </h2>
          <div className="mt-4">
            {status ? (
              <StatusBoard status={status} />
            ) : (
              <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                API unreachable
              </p>
            )}
          </div>
        </section>

        <section id="how">
          <h2 className="text-xl font-medium -tracking-[0.02em]">
            How it works
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                n: "1",
                t: "Call POST /check",
                d: "ticker, side and sizeUSD. No key, no signup.",
              },
              {
                n: "2",
                t: "Receive 402",
                d: "PAYMENT-REQUIRED describes the exact price: 0.005 USDT on X Layer.",
              },
              {
                n: "3",
                t: "Pay and retry",
                d: "Attach the payment signature; the PAYMENT-RESPONSE header carries the settlement tx.",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {s.n}
                </div>
                <div className="mt-3 text-sm font-semibold">{s.t}</div>
                <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="try">
          <h2 className="text-xl font-medium -tracking-[0.02em]">
            Try the unpaid call
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The response is a 402 with a base64 PAYMENT-REQUIRED header.
          </p>
          <div className="mt-4">
            <CurlBlock command={checkCurl} />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-medium -tracking-[0.02em]">
            Verdict rules
          </h2>
          <div className="mt-4">
            <VerdictRules rules={rules} />
          </div>
        </section>

        <section id="agents">
          <h2 className="text-xl font-medium -tracking-[0.02em]">
            USDT0 received by the service wallet
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Transfers to the payTo address, read from X Layer RPC. Each x402
            settlement lands here as a 0.005 USDT0 transfer.
          </p>
          <div className="mt-4">
            {payments ? (
              <PaymentsRecent data={payments} />
            ) : (
              <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                API unreachable
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-medium -tracking-[0.02em]">
            What the token gives you
          </h2>
          <div className="mt-4">
            <RightsCard rights={rights} />
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>
            <p>Not available to residents of {restricted.join(", ")}.</p>
            <p className="mt-1">{disclaimer}</p>
          </div>
          <div className="flex gap-5">
            <a
              href={`${PUBLIC_API_BASE}/health`}
              className="hover:text-foreground"
            >
              /health
            </a>
            <a
              href={`${PUBLIC_API_BASE}/catalog`}
              className="hover:text-foreground"
            >
              /catalog
            </a>
            <a
              href="https://www.okx.com/web3/explorer/xlayer"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
