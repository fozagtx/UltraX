import { describe, expect, it } from "vitest";
import { calibrate, scoreBucket } from "./calibrate.js";
import { score } from "./score.js";
import type { Bar } from "./types.js";

function deterministicSeries(length: number): Bar[] {
  let close = 100;
  return Array.from({ length }, (_, index) => {
    const returns = [0.018, -0.009, 0.013, -0.004, 0.02, -0.015];
    const change = index === 0 ? 0 : returns[(index - 1) % returns.length]!;
    const open = close;
    close *= 1 + change;
    return {
      ts: index * 86_400_000,
      open,
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
      volume: 1_000 + index * 20,
      confirmed: true,
    };
  });
}

describe("walk-forward calibration", () => {
  it("uses non-overlapping h-day samples and computes smoothed buckets", () => {
    const bars = deterministicSeries(100);
    const result = calibrate({ sample: bars }, 1);
    expect(result.samples).toBe(84);
    expect(result.directionalSamples).toBeGreaterThan(0);
    expect(
      Object.values(result.buckets).reduce((sum, bucket) => sum + bucket.n, 0),
    ).toBe(result.samples);
    for (const bucket of Object.values(result.buckets)) {
      expect(bucket.pUp).toBe((bucket.up + 1) / (bucket.n + 2));
    }
    expect(result.baseUpRate).toBeGreaterThanOrEqual(0);
    expect(result.baseUpRate).toBeLessThanOrEqual(1);
    expect(result.hitRate).toBeGreaterThanOrEqual(0);
    expect(result.hitRate).toBeLessThanOrEqual(1);
  });

  it("steps by the full horizon and excludes unconfirmed bars", () => {
    const bars = deterministicSeries(100);
    const weekly = calibrate({ sample: bars }, 7);
    const withLive = bars.map((bar, index) =>
      index === bars.length - 1 ? { ...bar, confirmed: false } : bar,
    );
    expect(weekly.samples).toBe(11);
    expect(calibrate({ sample: withLive }, 7).samples).toBe(11);
  });

  it("does not read future bars when scoring at t", () => {
    const bars = deterministicSeries(100);
    const before = score(bars, 60, 7);
    const mutatedFuture = bars.map((bar, index) =>
      index > 60 ? { ...bar, close: bar.close * 100, volume: 0 } : bar,
    );
    expect(score(mutatedFuture, 60, 7)).toEqual(before);
  });

  it("assigns the settled calibration buckets", () => {
    expect(scoreBucket(-50)).toBe("strong_bear");
    expect(scoreBucket(-25)).toBe("bear");
    expect(scoreBucket(0)).toBe("neutral");
    expect(scoreBucket(25)).toBe("bull");
    expect(scoreBucket(50)).toBe("strong_bull");
  });
});
