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
      className="block rounded-lg border p-4 transition-colors hover:border-[var(--accent)]"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      {value === null ? (
        <div
          className="mono mt-2 text-2xl"
          style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}
        >
          No data yet
        </div>
      ) : (
        <div
          className="mono mt-2 text-2xl"
          style={{ fontFamily: "var(--font-mono)" }}
          title={valueTitle}
        >
          {value}
        </div>
      )}
      {caption ? (
        <div className="mono mt-1 text-xs" style={{ color: "var(--muted)" }}>
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
