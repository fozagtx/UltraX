export interface VerdictInput {
  marketOpen: boolean;
  /** token on-chain price vs stock reference x multiplier, percent */
  gapVsStockPct: number | null;
  /** token on-chain price vs OKX exchange price, percent */
  gapVsOkxPct: number | null;
  /** expected exit value / size, percent */
  exitPct: number | null;
  /** names of required sources that failed */
  missing: string[];
  /** names of sources whose data is stale */
  stale: string[];
}

export type Verdict = "OK" | "CAUTION" | "STOP";

export interface VerdictResult {
  verdict: Verdict;
  reasons: string[];
}

export const SOURCE_LABELS: Record<string, string> = {
  realStock: "Stock price",
  okxExchange: "OKX exchange price",
  xlayerToken: "X Layer price",
  multiplier: "Token multiplier",
  exit: "Exit quote",
};

function fmtPct(n: number): string {
  const abs = Math.abs(n);
  return `${Math.round(abs * 10) / 10}%`;
}

const OK_REASON =
  "Market open, token within 1% of the stock, exit returns at least 98%";

export function decide(input: VerdictInput): VerdictResult {
  const reasons: string[] = [];
  // 0 = OK, 1 = CAUTION, 2 = STOP; the verdict is the worst band triggered.
  let level = 0;

  for (const s of input.missing.filter((x) => x !== "okxExchange")) {
    const label = SOURCE_LABELS[s] ?? s;
    reasons.push(
      s === "exit" ? "No exit available for this size" : `${label} unavailable`,
    );
    level = 2;
  }
  for (const s of input.stale.filter((x) => x !== "okxExchange")) {
    const label = SOURCE_LABELS[s] ?? s;
    reasons.push(`${label} is stale`);
    level = 2;
  }

  if (!input.marketOpen) {
    reasons.push("US market closed");
    level = Math.max(level, 1);
  }

  const gaps: { pct: number; label: string }[] = [];
  if (input.gapVsStockPct !== null)
    gaps.push({ pct: input.gapVsStockPct, label: "the stock" });
  if (input.gapVsOkxPct !== null)
    gaps.push({ pct: input.gapVsOkxPct, label: "OKX" });
  let maxGap: { pct: number; label: string } | null = null;
  for (const g of gaps) {
    if (maxGap === null || Math.abs(g.pct) > Math.abs(maxGap.pct)) maxGap = g;
  }
  if (maxGap && Math.abs(maxGap.pct) > 3) {
    reasons.push(
      `Token trades ${fmtPct(maxGap.pct)} ${
        maxGap.pct > 0 ? "above" : "below"
      } ${maxGap.label}`,
    );
    level = 2;
  } else if (maxGap && Math.abs(maxGap.pct) >= 1) {
    reasons.push(
      `Token trades ${fmtPct(maxGap.pct)} ${
        maxGap.pct > 0 ? "above" : "below"
      } ${maxGap.label}`,
    );
    level = Math.max(level, 1);
  }

  if (input.exitPct !== null) {
    if (input.exitPct < 90) {
      reasons.push(`You'd get back ${Math.round(input.exitPct)}% of the size`);
      level = 2;
    } else if (input.exitPct < 98) {
      reasons.push(`You'd get back ${Math.round(input.exitPct)}% of the size`);
      level = Math.max(level, 1);
    }
  }

  if (level === 2) return { verdict: "STOP", reasons };
  if (level === 1) return { verdict: "CAUTION", reasons };
  return { verdict: "OK", reasons: [OK_REASON] };
}
