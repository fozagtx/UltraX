import { Badge } from "@/components/ui/badge";
import type { StatusResponse } from "@/lib/api";

function fmt(n: number | null, dp = 2): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: 4,
  });
}

function timeShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toISOString().slice(11, 16)}Z`;
}

export function StatusBoard({ status }: { status: StatusResponse }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant={status.marketOpen ? "secondary" : "outline"}
          className={status.marketOpen ? "bg-success/15 text-success" : ""}
        >
          {status.marketOpen ? "Market open" : `Market closed · ${status.marketReason}`}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Next change {new Date(status.nextChange).toUTCString()}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {status.tokens.map((t) => (
          <div
            key={t.ticker}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="text-sm font-semibold">{t.ticker}</div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Stock (RedStone{` · ${timeShort(t.stockPriceAsOf)}`})
                </dt>
                <dd className="font-mono">${fmt(t.realStock)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">OKX exchange</dt>
                <dd className="font-mono">${fmt(t.okxExchange)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Multiplier</dt>
                <dd className="font-mono">{fmt(t.multiplier, 4)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Free, public sources. X Layer price, exit value and verdict are in the
        paid check.
      </p>
    </div>
  );
}
