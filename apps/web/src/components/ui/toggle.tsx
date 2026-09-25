"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function Toggle({
  on,
  onChange,
  className,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  className?: string;
  label?: string;
}) {
  const [init, setInit] = useState(false);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-on={on}
      className={cn("t-toggle", init && "is-init", className)}
      onClick={() => {
        setInit(true);
        onChange(!on);
      }}
    >
      <span className="t-toggle-thumb" />
    </button>
  );
}
