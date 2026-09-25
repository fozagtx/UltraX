"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { compact, thousands } from "@/lib/format";

export interface ChartPoint {
  date: string;
  value: number | null;
  partial?: boolean;
  partialReason?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { payload?: ChartPoint }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 12,
        padding: "6px 10px",
      }}
    >
      <div style={{ color: "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)" }}>
        {p.value === null ? "n/a" : `${thousands(p.value)} ${unit}`}
        {p.partial ? (
          <span style={{ color: "var(--muted)" }}>
            {" "}
            · partial{p.partialReason === "coverage" ? " (coverage)" : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function MetricChart({
  data,
  unit,
}: {
  data: ChartPoint[];
  unit: string;
}) {
  const hasPartial = data.some((p) => p.partial);
  return (
    <div>
      <div className="h-64 w-full sm:h-80">
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickFormatter={(d: string) => d.slice(5)}
              stroke="var(--border)"
            />
            <YAxis
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              stroke="var(--border)"
              width={60}
              tickFormatter={(v: number) => compact(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--border)", fillOpacity: 0.3 }}
              content={<ChartTooltip unit={unit} />}
            />
            <Bar dataKey="value" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {data.map((p) => (
                <Cell
                  key={p.date}
                  fill="var(--accent)"
                  fillOpacity={p.partial ? 0.35 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hasPartial ? (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Dimmed bars = partial day (coverage or today)
        </p>
      ) : null}
    </div>
  );
}
