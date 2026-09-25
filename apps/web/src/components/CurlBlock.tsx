"use client";

import { useState } from "react";

export default function CurlBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl border border-border bg-card p-4">
      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-foreground">
        {text}
      </pre>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md border border-border bg-white px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
