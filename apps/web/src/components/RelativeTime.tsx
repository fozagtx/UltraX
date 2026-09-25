"use client";

import { useEffect, useState } from "react";

function rel(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function RelativeTime({ iso }: { iso: string }) {
  const ts = new Date(iso).getTime();
  const [label, setLabel] = useState<string>(() => iso.slice(0, 10));
  useEffect(() => {
    setLabel(rel(ts));
    const t = setInterval(() => setLabel(rel(ts)), 30_000);
    return () => clearInterval(t);
  }, [ts]);
  return (
    <span className="font-mono tabular-nums" title={iso}>
      {label}
    </span>
  );
}
