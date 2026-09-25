import { describe, it, expect } from "vitest";
import { compact, usd, pct, truncateAddress } from "./format.js";

describe("compact", () => {
  it("formats large and small numbers", () => {
    expect(compact(1_240_000)).toBe("1.24M");
    expect(compact(540_900)).toBe("540.9K");
    expect(compact(150)).toBe("150");
    expect(compact(null)).toBe("n/a");
  });
});

describe("usd", () => {
  it("formats USD", () => {
    expect(usd(1234.5)).toBe("$1,234.50");
    expect(usd(0.000123)).toBe("$0.000123");
  });
});

describe("pct", () => {
  it("formats signed percent", () => {
    expect(pct(10)).toBe("+10.0%");
    expect(pct(-5.56)).toBe("-5.6%");
    expect(pct(null)).toBe("n/a");
  });
});

describe("truncateAddress", () => {
  it("truncates", () => {
    expect(truncateAddress("0x779ded0c9e1022225f8e0630b35a9b54be713736")).toBe(
      "0x779d…3736",
    );
  });
});
