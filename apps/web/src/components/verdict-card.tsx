import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function verdictBadgeVariant(v: string) {
  if (v === "STOP") return "destructive" as const;
  if (v === "CAUTION") return "outline" as const;
  return "secondary" as const;
}

export function ExampleCheckCard() {
  const facts: [string, string][] = [
    ["NVDA (RedStone)", "$224.58"],
    ["NVDAx on X Layer", "$219.40"],
    ["Gap vs stock", "-2.6%"],
    ["Exit for $500", "$431.00 (86%)"],
  ];
  return (
    <div className="flex h-full flex-col bg-white p-5 pt-14 text-left">
      <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">
        EXAMPLE /check RESPONSE
      </div>
      <div className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            verdict
          </span>
          <Badge variant="destructive" className="px-3 py-1 text-sm">
            STOP
          </Badge>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs leading-snug text-foreground">
          <li>You&apos;d get back 86% of $500</li>
          <li>Token trades 2.6% below the stock</li>
        </ul>
      </div>
      <div className="mt-3 space-y-2">
        {facts.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between text-xs"
          >
            <span className="text-muted-foreground">{k}</span>
            <span
              className={cn(
                "font-mono font-medium",
                k.startsWith("Exit") && "text-destructive",
              )}
            >
              {v}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto pb-6 text-center text-[10px] text-muted-foreground">
        Example response
      </div>
    </div>
  );
}
