import {
  ALL_ENDPOINTS,
  WHALE_ALERT_EVENT_SHAPE,
  CHAIN_ID,
} from "@ultrax/metrics";

export const dynamic = "force-dynamic";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export default function AgentsPage() {
  const listingUrl = process.env.NEXT_PUBLIC_OKXAI_LISTING_URL;
  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <h1 className="text-lg font-medium">For agents</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          ULTRA X is an on-chain analytics API for X Layer (chain {CHAIN_ID}).
          It serves daily network metrics, USDT0 stablecoin flows, whale
          transfers and holder concentration. Paid endpoints use the x402
          protocol with exact-scheme USDT0 payments on X Layer.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">How payment works</h2>
        <ol
          className="list-decimal space-y-2 pl-5 text-sm"
          style={{ color: "var(--muted)" }}
        >
          <li>
            Call any paid endpoint. You get HTTP 402 with a PAYMENT-REQUIRED
            header containing the price and payTo address.
          </li>
          <li>
            Sign an exact-scheme USDT0 payment on X Layer for the quoted amount
            via the OKX Payment SDK / Onchain OS agent.
          </li>
          <li>
            Retry the request with the PAYMENT-SIGNATURE header; the response
            is the JSON payload.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Endpoints</h2>
        <div
          className="overflow-x-auto rounded-lg border"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">Path</th>
                <th className="px-4 py-2">Params</th>
                <th className="px-4 py-2">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="mono px-4 py-2">GET</td>
                <td className="mono px-4 py-2">/health</td>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--muted)" }}>
                  -
                </td>
                <td className="mono px-4 py-2">free</td>
              </tr>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="mono px-4 py-2">GET</td>
                <td className="mono px-4 py-2">/catalog</td>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--muted)" }}>
                  -
                </td>
                <td className="mono px-4 py-2">free</td>
              </tr>
              {ALL_ENDPOINTS.map((m) => (
                <tr
                  key={m.id}
                  className="border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="mono px-4 py-2">{m.method}</td>
                  <td className="mono px-4 py-2">{m.path}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: "var(--muted)" }}>
                    {m.params.length
                      ? m.params
                          .map(
                            (p) =>
                              `${p.name}${p.required ? "*" : ""}${p.constraints ? ` (${p.constraints})` : ""}`,
                          )
                          .join(", ")
                      : "-"}
                  </td>
                  <td className="mono px-4 py-2">${m.priceUsd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Base URL: <span className="mono">{API_BASE}</span>. Required params
          marked *.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Whale alert webhook event</h2>
        <pre
          className="mono overflow-x-auto rounded-lg border p-4 text-xs"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {JSON.stringify(WHALE_ALERT_EVENT_SHAPE, null, 2)}
        </pre>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Discovery</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          <span className="mono">GET /v1/snapshot</span> returns the latest value
          and 7-day change for every metric in one call ($0.05).{" "}
          <span className="mono">GET /catalog</span> lists the full priced
          catalog with absolute URLs.
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          OKX.AI listing:{" "}
          {listingUrl ? (
            <a
              href={listingUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--accent)]"
              style={{ color: "var(--accent)" }}
            >
              Listing
            </a>
          ) : (
            "Listing pending"
          )}
        </p>
      </section>
    </div>
  );
}
