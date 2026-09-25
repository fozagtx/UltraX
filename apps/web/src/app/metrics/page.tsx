import Link from "next/link";
import { METRIC_CATALOG } from "@ultrax/metrics";

export const dynamic = "force-dynamic";

export default function MetricsIndex() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-medium">Metrics</h1>
      <div
        className="divide-y rounded-lg border"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {METRIC_CATALOG.map((m) => (
          <Link
            key={m.id}
            href={`/metrics/${m.id}`}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:border-[var(--accent)]"
          >
            <div>
              <div className="text-sm font-medium">{m.name}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {m.description}
              </div>
            </div>
            <div
              className="mono flex gap-4 text-xs"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              <span>{m.unit}</span>
              <span>${m.priceUsd.toFixed(2)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
