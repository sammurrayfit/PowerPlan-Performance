"use client";

import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { PRRow } from "@/app/(coach)/coach/coaching-tools/reports/actions";

interface Props {
  rows: PRRow[];
  viewMode: "chart" | "table";
}

const COLORS = [
  "#6366f1","#3b82f6","#22c55e","#f97316",
  "#ef4444","#a855f7","#ec4899","#14b8a6",
];

export function PRReport({ rows, viewMode }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No PRs recorded for this period.</p>;
  }

  if (viewMode === "chart") {
    // Group by athlete for separate scatter series
    const byAthlete: Record<string, { x: number; y: number; exercise: string }[]> = {};
    for (const r of rows) {
      if (!byAthlete[r.athleteName]) byAthlete[r.athleteName] = [];
      byAthlete[r.athleteName].push({
        x: new Date(r.date).getTime(),
        y: r.value,
        exercise: r.exerciseName,
      });
    }
    const athletes = Object.keys(byAthlete);

    return (
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={["auto", "auto"]}
            tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            tick={{ fontSize: 11 }}
          />
          <YAxis dataKey="y" name="Load" unit=" lbs" tick={{ fontSize: 12 }} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                  <p className="font-semibold">{d.exercise}</p>
                  <p>{d.y} lbs</p>
                  <p className="text-muted-foreground">{new Date(d.x).toLocaleDateString()}</p>
                </div>
              );
            }}
          />
          <Legend />
          {athletes.map((name, i) => (
            <Scatter key={name} name={name} data={byAthlete[name]} fill={COLORS[i % COLORS.length]} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-2.5 font-medium">Date</th>
            <th className="text-left px-4 py-2.5 font-medium">Athlete</th>
            <th className="text-left px-4 py-2.5 font-medium">Exercise</th>
            <th className="text-right px-4 py-2.5 font-medium">PR</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/30">
              <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                {new Date(row.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </td>
              <td className="px-4 py-2.5 font-medium">{row.athleteName}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{row.exerciseName}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-green-600">
                {row.value} {row.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
