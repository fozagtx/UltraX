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
          className={`px-2 py-0.5 font-mono text-xs tabular-nums ${
            current === d
              ? "border-b border-primary text-primary"
              : "border-b border-transparent text-muted-foreground"
          }`}
        >
          {d}d
        </Link>
      ))}
    </div>
  );
}
