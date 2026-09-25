export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  const fmt = (v: number, suffix: string) =>
    `${(n / (v === 1 ? 1 : v)).toFixed(abs >= 1e9 ? 2 : abs >= 1e6 ? 2 : 1)}${suffix}`;
  if (abs >= 1e9) return fmt(1e9, "B");
  if (abs >= 1e6) return fmt(1e6, "M");
  if (abs >= 1e3) return fmt(1e3, "K");
  if (n === 0) return "0";
  return abs >= 100 ? n.toFixed(0) : abs >= 1 ? n.toFixed(1) : n.toFixed(4);
}

export function thousands(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : 6;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`;
}

export function usdCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${compact(Math.abs(n))}`;
}

export function okb(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 4 })} OKB`;
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function truncateHash(hash: string): string {
  return truncateAddress(hash);
}
