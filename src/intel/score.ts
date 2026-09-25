import type { Bar, HorizonDays, Signal } from "./types.js";

export interface ScoreFeatures {
  returnPct: number;
  zMomentum: number;
  volatilityDailyPct: number;
  trend: number;
  volumeRatio: number | null;
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
}

export interface ScoreResult {
  score: number;
  signal: Signal;
  features: ScoreFeatures;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      (values.length - 1),
  );
}

function clip(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

export function volatilityDaily(bars: Bar[], t: number): number | null {
  if (t < 1 || t >= bars.length) return null;
  const first = Math.max(1, t - 29);
  const returns = [];
  for (let i = first; i <= t; i += 1) {
    returns.push(Math.log(bars[i]!.close / bars[i - 1]!.close));
  }
  return sampleStandardDeviation(returns);
}

export function rsi14At(bars: Bar[], t: number): number | null {
  if (t < 14 || t >= bars.length) return null;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= 14; i += 1) {
    const change = bars[i]!.close - bars[i - 1]!.close;
    if (change > 0) gainSum += change;
    else lossSum -= change;
  }
  let averageGain = gainSum / 14;
  let averageLoss = lossSum / 14;

  for (let i = 15; i <= t; i += 1) {
    const change = bars[i]!.close - bars[i - 1]!.close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    averageGain = (averageGain * 13 + gain) / 14;
    averageLoss = (averageLoss * 13 + loss) / 14;
  }

  if (averageLoss === 0) return averageGain > 0 ? 100 : 50;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

export function score(
  bars: Bar[],
  t: number,
  h: HorizonDays,
): ScoreResult | null {
  if (t < h + 14 || t >= bars.length) return null;

  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);
  const current = closes[t]!;
  const periodReturn = current / closes[t - h]! - 1;
  const sigma = volatilityDaily(bars, t) ?? 0;
  const zMomentum = sigma > 0 ? periodReturn / (sigma * Math.sqrt(h)) : 0;
  const momentumTerm = 0.5 * (clip(zMomentum, -3, 3) / 3);

  let sma20: number | null = null;
  let sma50: number | null = null;
  let trend = 0;
  if (t >= 19) {
    sma20 = mean(closes.slice(t - 19, t + 1));
    if (t >= 49) {
      sma50 = mean(closes.slice(t - 49, t + 1));
      if (current > sma20 && sma20 > sma50) trend = 1;
      else if (current < sma20 && sma20 < sma50) trend = -1;
    } else {
      trend = 0.5 * sign(current - sma20);
    }
  }
  const trendTerm = 0.25 * trend;

  const e = bars[t]!.confirmed ? t : t - 1;
  let volumeRatio: number | null = null;
  let volumeTerm = 0;
  const baseStart = e - h - 29;
  const baseEnd = e - h;
  if (baseStart >= 0) {
    const recent = mean(volumes.slice(e - h + 1, e + 1));
    const base = mean(volumes.slice(baseStart, baseEnd + 1));
    if (base > 0) {
      volumeRatio = recent / base;
      volumeTerm =
        0.15 * clip(Math.log2(volumeRatio), -1, 1) * sign(periodReturn);
    }
  }

  const rsi14 = rsi14At(bars, t);
  const rsiAdjustment =
    rsi14 !== null && rsi14 > 75
      ? -0.1
      : rsi14 !== null && rsi14 < 25
        ? 0.1
        : 0;
  const raw = momentumTerm + trendTerm + volumeTerm + rsiAdjustment;
  const roundedScore = Math.round(100 * clip(raw, -1, 1));
  const signal: Signal =
    roundedScore >= 25
      ? "bullish"
      : roundedScore <= -25
        ? "bearish"
        : "neutral";

  return {
    score: roundedScore,
    signal,
    features: {
      returnPct: periodReturn * 100,
      zMomentum,
      volatilityDailyPct: sigma * 100,
      trend,
      volumeRatio,
      rsi14,
      sma20,
      sma50,
    },
  };
}

export function expectedRange(
  last: number,
  sigma: number | null,
  h: HorizonDays,
): { low: number; high: number } | null {
  if (sigma === null) return null;
  const movement = sigma * Math.sqrt(h);
  return {
    low: last * Math.exp(-movement),
    high: last * Math.exp(movement),
  };
}
