export function CurlBlock({ command }: { command: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-[#1D1D1F] p-4 font-mono text-xs leading-relaxed text-[#F8F7F3]">
      {command}
    </pre>
  );
}
