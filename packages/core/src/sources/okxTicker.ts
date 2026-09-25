export interface OkxTicker {
  last: number;
  ts: number; // ms epoch
}

export function parseTicker(body: unknown): OkxTicker {
  const b = body as { code?: string | number; data?: unknown[] };
  if (String(b?.code) !== "0") throw new Error(`okx ticker: code ${b?.code}`);
  const first = (b.data ?? [])[0] as Record<string, unknown> | undefined;
  const last = Number(first?.last);
  const ts = Number(first?.ts);
  if (!Number.isFinite(last) || last <= 0)
    throw new Error("okx ticker: no last price");
  return { last, ts: Number.isFinite(ts) ? ts : 0 };
}

export async function getOkxTicker(instId: string): Promise<OkxTicker> {
  const res = await fetch(
    `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`okx ticker: HTTP ${res.status}`);
  return parseTicker(await res.json());
}
