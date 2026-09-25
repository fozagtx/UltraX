import { AddressLink, TxLink } from "./AddressLink";
import RelativeTime from "./RelativeTime";
import { usd } from "@/lib/format";

export interface WhaleItem {
  txHash: string;
  from: string;
  to: string;
  amountUsd: number | null;
  timestamp: string;
}

export default function WhaleFeed({
  title,
  items,
}: {
  title: string;
  items: WhaleItem[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No transfers indexed yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((t) => (
            <li key={t.txHash} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm tabular-nums">
                  {usd(t.amountUsd)}
                </span>
                <TxLink hash={t.txHash} />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex min-w-0 items-center gap-1">
                  <AddressLink address={t.from} />
                  <span aria-hidden="true">→</span>
                  <AddressLink address={t.to} />
                </span>
                <RelativeTime iso={t.timestamp} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
