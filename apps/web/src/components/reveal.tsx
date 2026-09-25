import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Pure-CSS reveal: .t-reveal-line animates in on load with a stagger delay.
// No JS gating — content is always visible once the animation runs (and
// immediately visible with JS disabled or prefers-reduced-motion off).
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

export function RevealLine({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  const style: CSSProperties | undefined =
    index > 0
      ? { animationDelay: `calc(var(--stagger-stagger) * ${index})` }
      : undefined;
  return (
    <div className={cn("t-reveal-line", className)} style={style}>
      {children}
    </div>
  );
}
