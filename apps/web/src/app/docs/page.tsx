import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { CurlBlock } from "@/components/curl-block";
import { VerdictRules } from "@/components/verdict-rules";
import { apiGet, PUBLIC_API_BASE, type CatalogResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

const RESPONSE_EXAMPLE = `{
  "verdict": "STOP",
  "reasons": ["You'd get back 86% of $500"],
  "price": {
    "realStock": 224.58,
    "okxExchange": 221.2,
    "multiplier": 1.0042,
    "xlayerToken": 219.4,
    "gapVsStockPct": -2.6,
    "gapVsOkxPct": -0.81,
    "marketOpen": true,
    "stockPriceAsOf": "2026-09-25T14:00:00.000Z"
  },
  "exit": { "sizeUSD": 500, "expectedUSD": 431.0, "priceImpactPct": -1.2 },
  "rights": {
    "type": "Tracker certificate, 1:1 backed",
    "voting": false,
    "dividends": "Reinvested through the token multiplier",
    "redemption": "Eligible holders only, US business days",
    "restricted": ["US", "EU", "CA", "UK", "AU"]
  },
  "payment": {
    "network": "eip155:196",
    "asset": "USDT0",
    "priceUsd": 0.005,
    "txHash": null,
    "note": "Settlement tx hash is returned in the PAYMENT-RESPONSE header (x402 v2)."
  },
  "restricted": ["US", "EU", "CA", "UK", "AU"],
  "disclaimer": "Information only, not investment advice.",
  "sources": {
    "realStock": "redstone",
    "okxExchange": "okx-ticker",
    "xlayerToken": "okx-market-price-info",
    "exit": "okx-dex-quote",
    "multiplier": "xlayer-rpc"
  },
  "checkedAt": "2026-09-25T14:01:00.000Z"
}`;

export default async function DocsPage() {
  const catalog = await apiGet<CatalogResponse>("/catalog");
  const spec = catalog?.inputRequired;
  const rules = catalog?.verdictRules ?? [];
  const restricted = catalog?.restricted ?? ["US", "EU", "CA", "UK", "AU"];
  const disclaimer =
    catalog?.disclaimer ?? "Information only, not investment advice.";
  const serviceDescription =
    catalog?.serviceDescription ??
    "Know What You Hold: paid pre-trade safety check for tokenized stocks (xStocks) on X Layer.";

  const curl400 = `curl -i -X POST ${PUBLIC_API_BASE}/check \\
  -H 'content-type: application/json' \\
  -d '{}'`;
  const curl402 = `curl -i -X POST ${PUBLIC_API_BASE}/check \\
  -H 'content-type: application/json' \\
  -d '{"ticker":"NVDAx","side":"sell","sizeUSD":500}'`;

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 pt-4">
        <SiteHeader />
      </div>
      <main className="mx-auto max-w-3xl space-y-12 px-4 py-14">
        <header>
          <p className="font-mono text-xs tracking-widest text-muted-foreground">
            DOCS
          </p>
          <h1 className="mt-2 text-3xl font-medium -tracking-[0.03em]">
            POST /check — pre-trade safety check
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            One verdict (OK / CAUTION / STOP), reference prices, the X Layer
            token price, the redemption multiplier and the expected exit value
            for your size. {catalog?.fee ?? "0.005"} USDT per call over x402 on{" "}
            {catalog?.network ?? "eip155:196"}.
          </p>
        </header>

        <section>
          <h2 className="text-lg font-medium">Parameters</h2>
          {spec ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Field</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Values</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(spec.required).map(([name, f]) => (
                    <tr
                      key={name}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-2.5 font-mono">{name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {f.type}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {f.enum
                          ? f.enum.join(" | ")
                          : `${f.min ?? 0} < x <= ${f.max ?? ""}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              API unreachable
            </p>
          )}
        </section>

        <section>
          <h2 className="text-lg font-medium">Missing fields → 400</h2>
          <div className="mt-3">
            <CurlBlock command={curl400} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-xs">
{`400 {
  "status": "input_required",
  "endpoint": "POST /check",
  "required": { "ticker": ..., "side": ..., "sizeUSD": ... },
  "missing": ["ticker", "side", "sizeUSD"]
}`}
          </pre>
        </section>

        <section>
          <h2 className="text-lg font-medium">Valid request → 402</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Without payment, a valid request returns 402 with a base64
            PAYMENT-REQUIRED header describing the exact-scheme USDT0 charge.
          </p>
          <div className="mt-3">
            <CurlBlock command={curl402} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium">Response</h2>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-xs leading-relaxed">
            {RESPONSE_EXAMPLE}
          </pre>
        </section>

        <section>
          <h2 className="text-lg font-medium">Verdict rules</h2>
          <div className="mt-3">
            <VerdictRules rules={rules} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium">
            Service description (OKX AI listing)
          </h2>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-card p-4 font-mono text-xs leading-relaxed">
            {serviceDescription}
          </pre>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <p>Not available to residents of {restricted.join(", ")}.</p>
          <p className="mt-1">{disclaimer}</p>
        </section>

        <p className="text-sm">
          <Link href="/" className="text-primary hover:underline">
            ← Back to Know What You Hold
          </Link>
        </p>
      </main>
    </div>
  );
}
