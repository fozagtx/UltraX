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
    <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono tabular-nums">
        {p.value === null ? "n/a" : `${thousands(p.value)} ${unit}`}
        {p.partial ? (
          <span className="text-muted-foreground">
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
            <CartesianGrid stroke="#E5E3DC" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#777773", fontSize: 11 }}
              tickFormatter={(d: string) => d.slice(5)}
              stroke="#E5E3DC"
            />
            <YAxis
              tick={{ fill: "#777773", fontSize: 11 }}
              stroke="#E5E3DC"
              width={60}
              tickFormatter={(v: number) => compact(v)}
            />
            <Tooltip
              cursor={{ fill: "#F1F0EB" }}
              content={<ChartTooltip unit={unit} />}
            />
            <Bar dataKey="value" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {data.map((p) => (
                <Cell
                  key={p.date}
                  fill="#3F83F8"
                  fillOpacity={p.partial ? 0.35 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hasPartial ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Dimmed bars = partial day (coverage or today)
        </p>
      ) : null}
    </div>
  );
}
