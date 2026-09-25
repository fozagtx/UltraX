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
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>{source}</span>
      {updatedAt ? (
        <span>
          Updated <RelativeTime iso={updatedAt} />
        </span>
      ) : null}
      {partial ? (
        <span className="rounded border border-primary px-1.5 py-0.5 text-primary">
          partial day
        </span>
      ) : null}
    </div>
  );
}
