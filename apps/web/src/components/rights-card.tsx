export function RightsCard({
  rights,
}: {
  rights: {
    type: string;
    voting: boolean;
    dividends: string;
    redemption: string;
    restricted: string[];
  };
}) {
  const rows: [string, string][] = [
    ["Instrument", rights.type],
    ["Voting rights", rights.voting ? "Yes" : "No"],
    ["Dividends", rights.dividends],
    ["Redemption", rights.redemption],
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <dl className="space-y-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
