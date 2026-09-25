"use client";

import { useState } from "react";

export default function CurlBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="relative rounded-lg border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <pre
        className="mono overflow-x-auto whitespace-pre-wrap text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
      >
        {text}
      </pre>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded border px-2 py-0.5 text-xs"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
