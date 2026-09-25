import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/metrics", label: "Metrics" },
  { href: "/token", label: "Token" },
  { href: "/agents", label: "For agents" },
];

export default function Nav() {
  return (
    <header className="border-b" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link
          href="/"
          className="mono shrink-0 whitespace-nowrap text-sm font-semibold tracking-widest"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          ULTRA X
        </Link>
        <span
          className="hidden shrink-0 rounded-md border px-2 py-0.5 text-xs sm:inline-block"
          style={{
            borderColor: "var(--border)",
            color: "var(--muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          X Layer · 196
        </span>
        <nav
          className="ml-auto flex gap-3 overflow-x-auto whitespace-nowrap text-xs sm:gap-4 sm:text-sm"
          style={{ scrollbarWidth: "none" }}
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="shrink-0 transition-colors hover:text-[var(--accent)]"
              style={{ color: "var(--muted)" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
