import { Badge } from "@/components/ui/badge";
import type { PaymentsResponse } from "@/lib/api";

function trunc(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function rel(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const isCheckPayment = (usd: number) => Math.abs(usd - 0.005) < 0.0001;

export function PaymentsRecent({ data }: { data: PaymentsResponse }) {
  const checks = data.payments.filter((p) => isCheckPayment(p.amountUsd)).length;
  if (data.warming && data.payments.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Scanning X Layer…
      </p>
    );
  }
  if (data.payments.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No transfers yet.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Amount</th>
            <th className="px-4 py-2.5 font-medium">Payer</th>
            <th className="px-4 py-2.5 font-medium">Time</th>
            <th className="px-4 py-2.5 font-medium">Tx</th>
          </tr>
        </thead>
        <tbody>
          {data.payments.map((p) => (
            <tr key={p.txHash} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5 font-mono">
                ${p.amountUsd.toFixed(3)}
                {isCheckPayment(p.amountUsd) ? (
                  <Badge variant="secondary" className="ml-2">
                    0.005 = 1 check
                  </Badge>
                ) : null}
              </td>
              <td className="px-4 py-2.5 font-mono">{trunc(p.from)}</td>
              <td className="px-4 py-2.5 text-muted-foreground">
                {rel(p.timestamp)}
              </td>
              <td className="px-4 py-2.5">
                <a
                  href={p.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-primary hover:underline"
                >
                  {trunc(p.txHash)}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        {data.payments.length} transfers · $
        {data.totalUsd24h.toFixed(3)} in the last 24h · {checks} exact 0.005
        payments
        {data.warming ? " · Scanning X Layer…" : ""}
      </div>
    </div>
  );
}
