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
    <div
      className="rounded-lg border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <h2 className="text-sm font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
          No transfers indexed yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
          {items.map((t) => (
            <li key={`${t.txHash}`} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="mono text-sm"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {usd(t.amountUsd)}
                </span>
                <TxLink hash={t.txHash} />
              </div>
              <div
                className="mt-1 flex items-center justify-between gap-2 text-xs"
                style={{ color: "var(--muted)" }}
              >
                <span className="flex items-center gap-1">
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
