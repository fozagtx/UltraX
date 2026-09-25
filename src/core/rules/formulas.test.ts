import { describe, expect, it } from "vitest";
import { exitPct, gapPct } from "./formulas.js";

describe("gapPct", () => {
  it("positive when token trades above ref*m", () => {
    // ref 200, m 1.1 -> fair 220; token 226.6 -> +3%
    expect(gapPct(226.6, 200, 1.1)).toBeCloseTo(3, 6);
  });
  it("negative when below", () => {
    expect(gapPct(97, 100, 1)).toBeCloseTo(-3, 6);
  });
  it("zero at fair value", () => {
    expect(gapPct(220, 200, 1.1)).toBeCloseTo(0, 6);
  });
});

describe("exitPct", () => {
  it("percent of size returned", () => {
    expect(exitPct(490, 500)).toBeCloseTo(98, 6);
    expect(exitPct(430, 500)).toBeCloseTo(86, 6);
  });
  it("0 for non-positive size", () => {
    expect(exitPct(100, 0)).toBe(0);
  });
});
