export function bucketByUtcDay(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}

export function utcToday(): string {
  return bucketByUtcDay(Date.now());
}

export function utcDayOffset(daysAgo: number): string {
  return bucketByUtcDay(Date.now() - daysAgo * 86_400_000);
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
