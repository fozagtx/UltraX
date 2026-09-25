export default function EmptyState({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {message ??
        "No data collected yet. This metric is sourced from OKX Onchain OS info/stats; the collector fills it once OKX_API_KEY is configured."}
    </div>
  );
}
