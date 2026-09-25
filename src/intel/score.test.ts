import { describe, expect, it } from "vitest";
import { rsi14At, score, volatilityDaily } from "./score.js";
import type { Bar } from "./types.js";

function risingBars(count = 60): Bar[] {
  let close = 100;
  return Array.from({ length: count }, (_, index) => {
    const changePct = 0.005 + index * 0.0005;
    const open = close;
    close *= 1 + changePct;
    return {
      ts: index * 86_400_000,
      open,
      close,
      high: close,
      low: open,
      volume: 1_000 * 1.1 ** index,
      confirmed: true,
    };
  });
}

function mirroredDownBars(bars: Bar[]): Bar[] {
  return bars.map((bar) => ({
    ...bar,
    open: 10_000 / bar.open,
    close: 10_000 / bar.close,
    high: 10_000 / bar.low,
    low: 10_000 / bar.high,
  }));
}

describe("ultrax-momentum-v1 score", () => {
  it("scores a rising trend with rising volume strongly bullish", () => {
    const result = score(risingBars(), 59, 1);
    expect(result?.score).toBeGreaterThanOrEqual(50);
    expect(result?.signal).toBe("bullish");
  });

  it("scores a mirrored falling trend symmetrically bearish", () => {
    const bars = risingBars();
    const up = score(bars, 59, 1);
    const down = score(mirroredDownBars(bars), 59, 1);
    expect(up?.score).toBeGreaterThanOrEqual(50);
    expect(down?.score).toBe(-up!.score);
    expect(down?.signal).toBe("bearish");
  });

  it("requires h + 14 bars of history", () => {
    const bars = risingBars(45);
    expect(score(bars, 20, 7)).toBeNull();
    expect(score(bars, 21, 7)).not.toBeNull();
  });

  it("matches hand-computed momentum, trend, volume, and RSI terms", () => {
    let close = 100;
    const bars = Array.from({ length: 50 }, (_, index) => {
      const logReturn =
        index === 0 ? 0 : index <= 19 ? 0.005 : index <= 48 ? 0.01 : 0.02;
      const open = close;
      close *= Math.exp(logReturn);
      return {
        ts: index * 86_400_000,
        open,
        close,
        high: close,
        low: open,
        volume: index === 49 ? 2 : 1,
        confirmed: true,
      };
    });
    const result = score(bars, 49, 1)!;
    const sigma = 0.01 / Math.sqrt(30);
    const expectedReturn = Math.exp(0.02) - 1;
    const expectedZ = expectedReturn / sigma;

    expect(volatilityDaily(bars, 49)).toBeCloseTo(sigma, 12);
    expect(result.features.returnPct).toBeCloseTo(expectedReturn * 100, 12);
    expect(result.features.zMomentum).toBeCloseTo(expectedZ, 10);
    expect(result.features.volatilityDailyPct).toBeCloseTo(sigma * 100, 10);
    expect(result.features.trend).toBe(1);
    expect(result.features.volumeRatio).toBe(2);
    expect(result.features.rsi14).toBe(100);
    expect(result.features.sma20).toBeCloseTo(
      bars.slice(30, 50).reduce((sum, bar) => sum + bar.close, 0) / 20,
      12,
    );
    expect(result.features.sma50).toBeCloseTo(
      bars.reduce((sum, bar) => sum + bar.close, 0) / 50,
      12,
    );
    expect(result.score).toBe(80);
    expect(result.signal).toBe("bullish");
  });

  it("handles RSI all-up, all-down, flat, and oversold cases", () => {
    const up = risingBars(20);
    const down = mirroredDownBars(up);
    const flat = up.map((bar) => ({ ...bar, close: 100, open: 100 }));
    const oversold = Array.from({ length: 20 }, (_, index) => ({
      ts: index * 86_400_000,
      open: 100 - index,
      close: 100 - index,
      high: 100 - index,
      low: 100 - index,
      volume: 1,
      confirmed: true,
    }));
    expect(rsi14At(up, 19)).toBe(100);
    expect(rsi14At(down, 19)).toBe(0);
    expect(rsi14At(flat, 19)).toBe(50);
    expect(rsi14At(oversold, 19)).toBe(0);
    expect(rsi14At(up, 13)).toBeNull();
  });
});
