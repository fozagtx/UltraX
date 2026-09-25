import Link from "next/link";
import { METRIC_CATALOG } from "@ultrax/metrics";
import { Page, PageHeader } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default function MetricsIndex() {
  return (
    <Page>
      <PageHeader
        eyebrow="X Layer · chain 196"
        title="Metrics"
        description="Seven daily metrics. Each links to a detail page with history and the paid API call."
      />
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {METRIC_CATALOG.map((m) => (
          <Link
            key={m.id}
            href={`/metrics/${m.id}`}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted"
          >
            <div>
              <div className="text-sm font-medium">{m.name}</div>
              <div className="text-xs text-muted-foreground">
                {m.description}
              </div>
            </div>
            <div className="flex gap-4 font-mono text-xs tabular-nums text-muted-foreground">
              <span>{m.unit}</span>
              <span>${m.priceUsd.toFixed(2)}</span>
            </div>
          </Link>
        ))}
      </div>
    </Page>
  );
}
