import Link from "next/link";
import DeltaBadge from "./DeltaBadge";

export default function KpiCard({
  label,
  value,
  valueTitle,
  caption,
  changePct,
  href,
}: {
  label: string;
  value: string | null;
  valueTitle?: string;
  caption?: string;
  changePct: number | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      {value === null ? (
        <div className="mt-2 font-mono text-2xl tabular-nums text-muted-foreground">
          No data yet
        </div>
      ) : (
        <div
          className="mt-2 font-mono text-2xl tabular-nums"
          title={valueTitle}
        >
          {value}
        </div>
      )}
      {caption ? (
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          {caption}
        </div>
      ) : null}
      {changePct !== null && Number.isFinite(changePct) ? (
        <div className="mt-2">
          <DeltaBadge value={changePct} />
        </div>
      ) : null}
    </Link>
  );
}
