import { score } from "./score.js";
import type {
  Bar,
  Calibration,
  CalibrationBucketName,
  HorizonDays,
} from "./types.js";

const BUCKET_NAMES: CalibrationBucketName[] = [
  "strong_bear",
  "bear",
  "neutral",
  "bull",
  "strong_bull",
];

function bucketFor(scoreValue: number): CalibrationBucketName {
  if (scoreValue <= -50) return "strong_bear";
  if (scoreValue <= -25) return "bear";
  if (scoreValue < 25) return "neutral";
  if (scoreValue < 50) return "bull";
  return "strong_bull";
}

export function scoreBucket(scoreValue: number): CalibrationBucketName {
  return bucketFor(scoreValue);
}

export function calibrationForScore(
  calibration: Calibration,
  scoreValue: number,
) {
  const bucket = calibration.buckets[bucketFor(scoreValue)];
  const confidence = bucket.n < 30 ? "low" : bucket.n < 150 ? "medium" : "high";
  return { pUp: bucket.pUp, confidence };
}

export function calibrate(
  series: Record<string, Bar[]>,
  h: HorizonDays,
): Calibration {
  const accumulators = Object.fromEntries(
    BUCKET_NAMES.map((name) => [name, { n: 0, up: 0, returnSum: 0 }]),
  ) as Record<
    CalibrationBucketName,
    { n: number; up: number; returnSum: number }
  >;
  let samples = 0;
  let upCount = 0;
  let directionalSamples = 0;
  let hits = 0;

  for (const originalBars of Object.values(series)) {
    const bars = originalBars.filter((bar) => bar.confirmed);
    for (let t = bars.length - 1 - h; t >= h + 14; t -= h) {
      const predicted = score(bars, t, h);
      if (!predicted) continue;
      const forwardReturn = bars[t + h]!.close / bars[t]!.close - 1;
      const bucket = accumulators[bucketFor(predicted.score)]!;
      bucket.n += 1;
      bucket.up += forwardReturn > 0 ? 1 : 0;
      bucket.returnSum += forwardReturn;
      samples += 1;
      upCount += forwardReturn > 0 ? 1 : 0;
      if (Math.abs(predicted.score) >= 25) {
        directionalSamples += 1;
        if (
          (predicted.score > 0 && forwardReturn > 0) ||
          (predicted.score < 0 && forwardReturn < 0)
        ) {
          hits += 1;
        }
      }
    }
  }

  const buckets = Object.fromEntries(
    BUCKET_NAMES.map((name) => {
      const item = accumulators[name]!;
      return [
        name,
        {
          n: item.n,
          up: item.up,
          pUp: (item.up + 1) / (item.n + 2),
          avgFwdReturnPct: item.n === 0 ? 0 : (item.returnSum / item.n) * 100,
        },
      ];
    }),
  ) as Calibration["buckets"];

  return {
    buckets,
    samples,
    baseUpRate: samples === 0 ? null : upCount / samples,
    directionalSamples,
    hitRate: directionalSamples === 0 ? null : hits / directionalSamples,
  };
}
