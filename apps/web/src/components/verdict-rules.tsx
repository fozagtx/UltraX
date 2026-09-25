import { Badge } from "@/components/ui/badge";
import { verdictBadgeVariant } from "./verdict-card";

export function VerdictRules({
  rules,
}: {
  rules: { verdict: string; condition: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <table className="w-full text-left text-sm">
        <tbody>
          {rules.map((r) => (
            <tr
              key={r.verdict}
              className="border-b border-border last:border-0"
            >
              <td className="w-28 px-4 py-3">
                <Badge variant={verdictBadgeVariant(r.verdict)}>
                  {r.verdict}
                </Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{r.condition}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
