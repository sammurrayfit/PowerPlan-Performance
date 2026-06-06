"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from "recharts";
import type { AttendanceRow } from "@/app/(coach)/coach/coaching-tools/reports/actions";

interface Props {
  data: AttendanceRow[];
  viewMode: "chart" | "table";
}

function pctColor(pct: number) {
  if (pct >= 90) return "#22c55e";
  if (pct >= 70) return "#f97316";
  return "#ef4444";
}

export function AttendanceReport({ data, viewMode }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No attendance data for this period.</p>;
  }

  if (viewMode === "chart") {
    const sorted = [...data].sort((a, b) => b.pct - a.pct);
    return (
      <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 44)}>
        <BarChart data={sorted} layout="vertical" margin={{ left: 20, right: 40, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="athleteName" width={120} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => [`${v}%`, "Attendance"]} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
            {sorted.map((entry) => (
              <Cell key={entry.athleteId} fill={pctColor(entry.pct)} />
            ))}
          </Bar>
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
            <th className="text-right px-4 py-2.5 font-medium text-green-600">Present</th>
            <th className="text-right px-4 py-2.5 font-medium text-amber-600">Late</th>
            <th className="text-right px-4 py-2.5 font-medium text-red-500">Absent</th>
            <th className="text-right px-4 py-2.5 font-medium">Total</th>
            <th className="text-right px-4 py-2.5 font-medium">Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {[...data].sort((a, b) => b.pct - a.pct).map((row) => (
            <tr key={row.athleteId} className="hover:bg-muted/30">
              <td className="px-4 py-2.5 font-medium">{row.athleteName}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.present}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.late}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.absent}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{row.total}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold"
                style={{ color: pctColor(row.pct) }}>{row.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
