import { describe, it, expect } from "vitest";
import { bucketByUtcDay, pctChange } from "./pure.js";

describe("bucketByUtcDay", () => {
  it("returns YYYY-MM-DD in UTC", () => {
    expect(bucketByUtcDay(Date.UTC(2026, 0, 15, 12, 34))).toBe("2026-01-15");
    expect(bucketByUtcDay(Date.UTC(2026, 0, 15, 23, 59, 59))).toBe("2026-01-15");
    expect(bucketByUtcDay(Date.UTC(2026, 0, 16, 0, 0, 0))).toBe("2026-01-16");
  });
});

describe("pctChange", () => {
  it("computes 7-day change", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(90, 100)).toBeCloseTo(-10);
  });
  it("handles zero previous", () => {
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(5, 0)).toBeNull();
  });
});
