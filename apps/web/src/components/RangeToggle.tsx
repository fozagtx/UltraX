import Link from "next/link";

export default function RangeToggle({
  base,
  current,
}: {
  base: string;
  current: number;
}) {
  return (
    <div className="flex gap-1">
      {[7, 30].map((d) => (
        <Link
          key={d}
          href={`${base}${base.includes("?") ? "&" : "?"}days=${d}`}
          className="mono px-2 py-0.5 text-xs"
          style={{
            color: current === d ? "var(--accent)" : "var(--muted)",
            borderBottom:
              current === d
                ? "1px solid var(--accent)"
                : "1px solid transparent",
          }}
        >
          {d}d
        </Link>
      ))}
    </div>
  );
}
