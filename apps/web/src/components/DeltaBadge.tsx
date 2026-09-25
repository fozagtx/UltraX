import { pct } from "@/lib/format";

export default function DeltaBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-xs tabular-nums ${positive ? "text-[#41A85F]" : "text-destructive"}`}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        <path
          d={positive ? "M4 0 L8 8 L0 8 Z" : "M4 8 L0 0 L8 0 Z"}
          fill="currentColor"
        />
      </svg>
      {pct(value)}
      <span className="text-muted-foreground">7d</span>
    </span>
  );
}
