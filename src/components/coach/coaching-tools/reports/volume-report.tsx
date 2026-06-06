"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { VolumeWeek, VolumeRow } from "@/app/(coach)/coach/coaching-tools/reports/actions";

interface Props {
  weeks: VolumeWeek[];
  rows: VolumeRow[];
  athleteNames: string[];
  viewMode: "chart" | "table";
}

const COLORS = [
  "#6366f1","#3b82f6","#22c55e","#f97316",
  "#ef4444","#a855f7","#ec4899","#14b8a6",
];

export function VolumeReport({ weeks, rows, athleteNames, viewMode }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No workout logs for this period.</p>;
  }

  if (viewMode === "chart") {
    if (weeks.length === 0) {
      return <p className="text-sm text-muted-foreground py-8 text-center">No volume data to chart for this period.</p>;
    }
    return (
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={weeks} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} lbs`, ""]} />
          <Legend />
          {athleteNames.map((name, i) => (
            <Bar key={name} dataKey={name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
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
            <th className="text-right px-4 py-2.5 font-medium">Sets</th>
            <th className="text-right px-4 py-2.5 font-medium">Reps</th>
            <th className="text-right px-4 py-2.5 font-medium">Volume (lbs)</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/30">
              <td className="px-4 py-2.5 font-medium">{row.athleteName}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{row.exerciseName}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.totalSets}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.totalReps}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{row.totalVolume.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
