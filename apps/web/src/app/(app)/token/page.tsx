import {
  getCache,
  setCache,
  fetchHolderConcentration,
  CHAIN_ID,
} from "@ultrax/metrics";
import { getDb } from "@/lib/db";
import { Page, PageHeader } from "@/components/app-shell";
import CurlBlock from "@/components/CurlBlock";
import EmptyState from "@/components/EmptyState";
import { AddressLink } from "@/components/AddressLink";
import { thousands } from "@/lib/format";

export const dynamic = "force-dynamic";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

interface HolderPayload {
  metric: string;
  token: string;
  chainId?: number;
  top10Pct: number | null;
  top50Pct: number | null;
  top100Pct: number | null;
  top20Pct: number | null;
  holders: {
    address: string;
    pct: number | null;
    balance: number | null;
    isContract?: boolean;
    isExchange?: boolean;
  }[];
  source: string;
  updatedAt: string;
}

async function loadHolder(
  address: string,
): Promise<{ data: HolderPayload | null; error?: string }> {
  const db = getDb();
  const cacheKey = `holder-concentration:${address.toLowerCase()}`;
  const cached = (await getCache(db, cacheKey).catch(() => null)) as
    | HolderPayload
    | null;
  if (cached) return { data: cached };

  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  if (!apiKey || !secretKey || !passphrase) return { data: null };

  try {
    const r = await fetchHolderConcentration(
      {
        apiKey,
        secretKey,
        passphrase,
        baseUrl: process.env.OKX_BASE_URL ?? "https://web3.okx.com",
      },
      address,
    );
    const payload: HolderPayload = {
      metric: "holder-concentration",
      token: r.token,
      chainId: r.chainId,
      top10Pct: r.top10Pct,
      top50Pct: r.top50Pct,
      top100Pct: r.top100Pct,
      top20Pct: r.top20Pct,
      holders: r.holders,
      source: r.source,
      updatedAt: new Date().toISOString(),
    };
    await setCache(db, cacheKey, payload, 3600);
    return { data: payload };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

export default async function TokenPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const sp = await searchParams;
  const address = sp.address?.trim() ?? "";
  const valid = ADDR_RE.test(address);

  let result: { data: HolderPayload | null; error?: string } | null = null;
  if (valid) result = await loadHolder(address);

  const curl = `curl -i "${API_BASE}/v1/metrics/holder-concentration?token=${valid ? address : "<token-address>"}"
# 402 Payment Required + PAYMENT-REQUIRED header (x402, exact scheme, USDT0 on X Layer). Price: $0.02 per call.`;

  return (
    <Page>
      <PageHeader
        eyebrow="X Layer · chain 196"
        title="Token lookup"
        description="Top-holder concentration for a token contract on X Layer."
      />

      <form method="get" className="flex gap-2">
        <input
          name="address"
          defaultValue={address}
          placeholder="0x… token contract address"
          className="w-full max-w-xl rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm outline-none focus:border-primary"
          pattern="0x[0-9a-fA-F]{40}"
          title="0x-prefixed 40-hex address"
        />
        <button
          type="submit"
          className="rounded-lg border border-primary px-4 text-sm text-primary transition-colors hover:bg-accent"
        >
          Look up
        </button>
      </form>

      {address && !valid ? (
        <EmptyState message="Not a valid token address. Expected a 0x-prefixed 40-hex string." />
      ) : null}

      {result?.data ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-sm">
            Holder concentration{" "}
            <AddressLink address={result.data.token} />{" "}
            <span className="text-xs text-muted-foreground">
              via {result.data.source}
            </span>
          </p>
          {[
            ["Top 10", result.data.top10Pct],
            ["Top 20", result.data.top20Pct],
            ["Top 50", result.data.top50Pct],
            ["Top 100", result.data.top100Pct],
          ]
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([label, v]) => (
              <div key={label as string} className="mb-2">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>{label}</span>
                  <span className="font-mono tabular-nums">
                    {Number(v).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div
                    className="h-2 rounded bg-primary"
                    style={{ width: `${Math.min(100, Number(v))}%` }}
                  />
                </div>
              </div>
            ))}
          {result.data.holders.length ? (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Address</th>
                  <th className="py-2 pr-4">Share</th>
                  <th className="py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {result.data.holders.slice(0, 20).map((h) => (
                  <tr key={h.address} className="border-t border-border">
                    <td className="py-1.5 pr-4">
                      <AddressLink address={h.address} />
                    </td>
                    <td className="py-1.5 pr-4 font-mono tabular-nums">
                      {h.pct !== null ? `${Number(h.pct).toFixed(2)}%` : "n/a"}
                    </td>
                    <td className="py-1.5 font-mono tabular-nums">
                      {h.balance !== null ? thousands(h.balance) : "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : result && valid ? (
        <div className="space-y-3">
          <EmptyState
            message={
              result.error
                ? `Fetch failed: ${result.error}`
                : "Not fetched yet. Holder data is fetched on demand through the paid API."
            }
          />
          <CurlBlock text={curl} />
        </div>
      ) : null}

      {!result ? (
        <p className="text-sm text-muted-foreground">
          Enter a token contract address on X Layer (chain {CHAIN_ID}) to see
          top-holder concentration.
        </p>
      ) : null}
    </Page>
  );
}
