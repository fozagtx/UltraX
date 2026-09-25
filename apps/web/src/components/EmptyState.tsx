export default function EmptyState({ message }: { message?: string }) {
  return (
    <div
      className="rounded-lg border border-dashed p-8 text-center text-sm"
      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
    >
      {message ??
        "No data collected yet. This metric is sourced from OKX Onchain OS info/stats; the collector fills it once OKX_API_KEY is configured."}
    </div>
  );
}
