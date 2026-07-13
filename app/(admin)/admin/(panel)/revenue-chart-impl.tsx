"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartPoint = { label: string; euros: number; commandes: number };

// Implémentation recharts isolée : chargée dynamiquement (ssr:false) par
// revenue-chart.tsx pour sortir la lib du bundle initial du dashboard.
export default function RevenueChartImpl({ points }: { points: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" aria-hidden="true">
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#6f6a65" }}
          tickLine={false}
          axisLine={{ stroke: "#e7e5e4" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#6f6a65" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}€`}
          width={48}
        />
        <Tooltip
          formatter={(value, name) =>
            name === "euros"
              ? [`${Number(value).toFixed(2).replace(".", ",")}€`, "CA"]
              : [String(value), "Commandes"]
          }
          labelStyle={{ color: "#44403c", fontWeight: 600 }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #e7e5e4",
            fontSize: 13,
          }}
        />
        <Bar dataKey="euros" fill="#870c20" radius={[3, 3, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
