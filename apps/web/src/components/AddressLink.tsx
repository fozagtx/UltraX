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
      className="font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
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
      className="font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
    >
      {truncateHash(hash)}
    </a>
  );
}
