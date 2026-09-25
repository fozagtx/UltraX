import RelativeTime from "./RelativeTime";

export default function SourceLine({
  source,
  updatedAt,
  partial,
}: {
  source: string;
  updatedAt?: string | null;
  partial?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 text-xs"
      style={{ color: "var(--muted)" }}
    >
      <span>{source}</span>
      {updatedAt ? (
        <span>
          Updated <RelativeTime iso={updatedAt} />
        </span>
      ) : null}
      {partial ? (
        <span
          className="rounded border px-1.5 py-0.5"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          today (partial)
        </span>
      ) : null}
    </div>
  );
}
