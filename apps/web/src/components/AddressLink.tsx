import { EXPLORER_BASE } from "@ultrax/metrics";
import { truncateAddress, truncateHash } from "@/lib/format";

const base = process.env.NEXT_PUBLIC_EXPLORER_BASE ?? EXPLORER_BASE;

export function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={`${base}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      title={address}
      className="mono text-xs hover:text-[var(--accent)]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {truncateAddress(address)}
    </a>
  );
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`${base}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      title={hash}
      className="mono text-xs hover:text-[var(--accent)]"
      style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}
    >
      {truncateHash(hash)}
    </a>
  );
}
