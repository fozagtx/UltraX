import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-4 z-50 mx-auto w-fit max-w-[calc(100vw-2rem)]">
      <div className="flex h-14 items-center gap-4 rounded-full bg-[#1D1D1F] pl-6 pr-2 shadow-lg shadow-black/10 sm:gap-10">
        <div className="flex items-center gap-9">
          <Link href="/" className="flex items-center gap-2">
            <span className="whitespace-nowrap font-mono text-sm font-semibold tracking-widest text-white">
              KWYH
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-white/60 md:flex">
            <Link
              href="/#how"
              className="transition-colors hover:text-white"
            >
              How it works
            </Link>
            <Link href="/docs" className="transition-colors hover:text-white">
              Docs
            </Link>
            <Link
              href="/#agents"
              className="transition-colors hover:text-white"
            >
              For agents
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/docs"
            className="rounded-full bg-[#F8F7F3] px-5 py-2 text-sm font-semibold text-[#1D1D1F] transition-transform hover:-translate-y-px"
          >
            Read the docs
          </Link>
        </div>
      </div>
    </header>
  );
}
