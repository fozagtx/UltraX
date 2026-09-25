export function log(
  level: "info" | "warn" | "error",
  msg: string,
  extra: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    service: "ultrax-api",
    level,
    ts: new Date().toISOString(),
    msg,
    ...extra,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

export function jobLog(
  level: "info" | "warn" | "error",
  job: string,
  msg: string,
  err?: unknown,
): void {
  log(level, msg, {
    job,
    err: err instanceof Error ? err.message : err ? String(err) : undefined,
  });
}
