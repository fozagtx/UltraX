"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Crossfades between two background layers on an interval.
 * Children render on top of whichever background is active.
 */
export function BackgroundSwitcher({
  backgrounds,
  intervalMs = 8000,
  className,
  children,
}: {
  backgrounds: ReactNode[];
  intervalMs?: number;
  className?: string;
  children?: ReactNode;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (backgrounds.length < 2) return;
    const id = setInterval(
      () => setActive((i) => (i + 1) % backgrounds.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [backgrounds.length, intervalMs]);

  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      {backgrounds.map((bg, i) => (
        <div
          key={i}
          aria-hidden={i !== active}
          className={cn(
            "absolute inset-0 transition-opacity [transition-duration:1600ms] ease-in-out",
            i === active ? "opacity-100" : "opacity-0",
          )}
        >
          {bg}
        </div>
      ))}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
