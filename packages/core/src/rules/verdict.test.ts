import { describe, expect, it } from "vitest";
import { decide, type VerdictInput } from "./verdict.js";

const base: VerdictInput = {
  marketOpen: true,
  gapVsStockPct: 0.2,
  gapVsOkxPct: 0.1,
  exitPct: 99.5,
  missing: [],
  stale: [],
};

describe("decide", () => {
  it("OK returns the single OK reason", () => {
    expect(decide(base)).toEqual({
      verdict: "OK",
      reasons: [
        "Market open, token within 1% of the stock, exit returns at least 98%",
      ],
    });
  });

  it("STOP when a required source is missing", () => {
    const r = decide({ ...base, missing: ["realStock"] });
    expect(r.verdict).toBe("STOP");
    expect(r.reasons).toContain("Stock price unavailable");
  });

  it("missing okxExchange is not fatal", () => {
    const r = decide({ ...base, gapVsOkxPct: null, missing: ["okxExchange"] });
    expect(r.verdict).toBe("OK");
  });

  it("STOP when a required source is stale", () => {
    const r = decide({ ...base, stale: ["xlayerToken"] });
    expect(r.verdict).toBe("STOP");
    expect(r.reasons.join(" ")).toContain("stale");
  });

  it("missing exit -> STOP 'No exit available'", () => {
    const r = decide({ ...base, missing: ["exit"] });
    expect(r.verdict).toBe("STOP");
    expect(r.reasons).toContain("No exit available for this size");
  });

  it("STOP on |gap| > 3", () => {
    const r = decide({ ...base, gapVsStockPct: 3.5 });
    expect(r.verdict).toBe("STOP");
    expect(r.reasons.join(" ")).toContain("above the stock");
  });

  it("STOP on negative gap > 3 below OKX", () => {
    const r = decide({ ...base, gapVsStockPct: null, gapVsOkxPct: -3.4 });
    expect(r.verdict).toBe("STOP");
    expect(r.reasons.join(" ")).toContain("below OKX");
  });

  it("uses the larger absolute gap for the threshold", () => {
    const stop = decide({ ...base, gapVsStockPct: 0.5, gapVsOkxPct: -3.2 });
    expect(stop.verdict).toBe("STOP");
    const caution = decide({ ...base, gapVsStockPct: 2.8, gapVsOkxPct: 0.4 });
    expect(caution.verdict).toBe("CAUTION");
    expect(caution.reasons.join(" ")).toContain("2.8%");
  });

  it("CAUTION on gap 1-3", () => {
    const r = decide({ ...base, gapVsStockPct: 1.4, gapVsOkxPct: null });
    expect(r.verdict).toBe("CAUTION");
    expect(r.reasons.join(" ")).toContain("1.4%");
  });

  it("boundary: gap exactly 1 -> CAUTION, exactly 3 -> CAUTION", () => {
    expect(decide({ ...base, gapVsStockPct: 1 }).verdict).toBe("CAUTION");
    expect(decide({ ...base, gapVsStockPct: 3 }).verdict).toBe("CAUTION");
    expect(decide({ ...base, gapVsStockPct: 3.01 }).verdict).toBe("STOP");
  });

  it("STOP on exit < 90", () => {
    const r = decide({ ...base, exitPct: 86 });
    expect(r.verdict).toBe("STOP");
    expect(r.reasons.join(" ")).toContain("86%");
  });

  it("CAUTION on exit 90-98; boundary 98 is OK", () => {
    expect(decide({ ...base, exitPct: 90 }).verdict).toBe("CAUTION");
    expect(decide({ ...base, exitPct: 97.9 }).verdict).toBe("CAUTION");
    expect(decide({ ...base, exitPct: 98 }).verdict).toBe("OK");
  });

  it("CAUTION when market closed even if all else fine", () => {
    const r = decide({ ...base, marketOpen: false });
    expect(r.verdict).toBe("CAUTION");
    expect(r.reasons).toContain("US market closed");
  });

  it("null gaps are skipped when the other gap is available", () => {
    const r = decide({ ...base, gapVsStockPct: null, gapVsOkxPct: 2 });
    expect(r.verdict).toBe("CAUTION");
  });

  it("accumulates reasons across bands", () => {
    const r = decide({ ...base, marketOpen: false, exitPct: 95 });
    expect(r.verdict).toBe("CAUTION");
    expect(r.reasons).toContain("US market closed");
    expect(r.reasons.join(" ")).toContain("95%");
  });

  it("STOP still lists every applicable reason", () => {
    const r = decide({
      ...base,
      marketOpen: false,
      missing: ["realStock"],
      gapVsStockPct: 4,
      exitPct: 85,
    });
    expect(r.verdict).toBe("STOP");
    expect(r.reasons).toContain("Stock price unavailable");
    expect(r.reasons).toContain("US market closed");
    expect(r.reasons.join(" ")).toContain("4%");
    expect(r.reasons.join(" ")).toContain("85%");
    expect(r.reasons.length).toBe(4);
  });
});
