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
import type { DayPoint } from "@/lib/stats";

const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
});

export function RevenueChart({ data }: { data: DayPoint[] }) {
  const points = data.map((d) => ({
    label: dayFmt.format(new Date(`${d.day}T00:00:00`)),
    euros: d.revenueCents / 100,
    commandes: d.orders,
  }));

  return (
    <div className="h-72 w-full" data-testid="revenue-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#78716c" }}
            tickLine={false}
            axisLine={{ stroke: "#e7e5e4" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#78716c" }}
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
    </div>
  );
}
