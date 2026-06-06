"use client";

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { MaxPoint, MaxRow } from "@/app/(coach)/coach/coaching-tools/reports/actions";

interface Props {
  points: MaxPoint[];
  rows: MaxRow[];
  viewMode: "chart" | "table";
}

const COLORS = [
  "#6366f1","#3b82f6","#22c55e","#f97316",
  "#ef4444","#a855f7","#ec4899","#14b8a6",
];

export function MaxProgressionReport({ points, rows, viewMode }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No max data for the selected filters.</p>;
  }

  // Athlete names from rows for line keys
  const athleteNames = [...new Set(rows.map((r) => r.athleteName))];

  if (viewMode === "chart") {
    if (points.length === 0) {
      return <p className="text-sm text-muted-foreground py-8 text-center">Not enough data points to chart.</p>;
    }
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={points} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => new Date(v + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          />
          <YAxis tick={{ fontSize: 12 }} unit=" lbs" />
          <Tooltip
            formatter={(v, name) => [`${v} lbs`, name]}
            labelFormatter={(label) => new Date(String(label) + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          />
          <Legend />
          {athleteNames.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-2.5 font-medium">Athlete</th>
            <th className="text-left px-4 py-2.5 font-medium">Exercise</th>
            <th className="text-right px-4 py-2.5 font-medium">Current Max</th>
            <th className="text-right px-4 py-2.5 font-medium">Change</th>
            <th className="text-right px-4 py-2.5 font-medium">Entries</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const first = row.history[0]?.value ?? row.current;
            const change = row.current - first;
            return (
              <tr key={`${row.athleteId}-${row.exerciseId}`} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 font-medium">{row.athleteName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.exerciseName}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                  {row.current} {row.unit}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                  change > 0 ? "text-green-600" : change < 0 ? "text-red-500" : "text-muted-foreground"
                }`}>
                  {change > 0 ? `+${change}` : change === 0 ? "—" : change} {change !== 0 ? row.unit : ""}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {row.history.length}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
