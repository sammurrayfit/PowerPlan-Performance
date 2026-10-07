"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from "recharts";
import type { AttendanceRow } from "@/app/(coach)/coach/coaching-tools/reports/actions";
import { StatCards, ChartCard, ChartTooltip, EmptyState, SortableTable, AXIS_TICK, GRID_STROKE, type Column } from "./report-ui";

// Status colors (good / warning / critical), always shown next to the % label.
function pctColor(pct: number) {
  if (pct >= 90) return "#0ca30c";
  if (pct >= 70) return "#fab219";
  return "#d03b3b";
}

const COLUMNS: Column<AttendanceRow>[] = [
  { key: "name", header: "Athlete", cell: (r) => <span className="font-medium">{r.athleteName}</span>, sort: (r) => r.athleteName },
  { key: "present", header: "Present", cell: (r) => r.present, sort: (r) => r.present, align: "right" },
  { key: "late", header: "Late", cell: (r) => r.late, sort: (r) => r.late, align: "right" },
  { key: "absent", header: "Absent", cell: (r) => r.absent, sort: (r) => r.absent, align: "right" },
  { key: "total", header: "Recorded", cell: (r) => <span className="text-muted-foreground">{r.total}</span>, sort: (r) => r.total, align: "right" },
  {
    key: "pct", header: "Rate", align: "right", sort: (r) => (r.total ? r.pct : -1),
    cell: (r) => r.total === 0 ? <span className="text-muted-foreground">—</span> : (
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <span className="h-2 w-2 rounded-full" style={{ background: pctColor(r.pct) }} />
        {r.pct}%
      </span>
    ),
  },
];

export function AttendanceReport({ data }: { data: AttendanceRow[] }) {
  const recorded = data.filter((r) => r.total > 0);
  if (recorded.length === 0) {
    return <EmptyState>No attendance recorded for this period.</EmptyState>;
  }

  const present = recorded.reduce((s, r) => s + r.present, 0);
  const late = recorded.reduce((s, r) => s + r.late, 0);
  const absent = recorded.reduce((s, r) => s + r.absent, 0);
  const total = present + late + absent;
  const below = recorded.filter((r) => r.pct < 70).length;
  const sorted = [...recorded].sort((a, b) => b.pct - a.pct);

  return (
    <div className="space-y-4">
      <StatCards stats={[
        { label: "Attendance rate", value: `${Math.round(((present + late) / total) * 100)}%`, hint: "present + late" },
        { label: "Present", value: present },
        { label: "Late", value: late },
        { label: "Absent", value: absent, hint: below ? `${below} athlete${below === 1 ? "" : "s"} below 70%` : "everyone at 70%+" },
      ]} />

      {sorted.length > 1 && (
        <ChartCard title="Attendance by athlete" subtitle="Share of recorded sessions attended (present or late)">
          <ResponsiveContainer width="100%" height={sorted.length * 28 + 32}>
            <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }} barCategoryGap={4}>
              <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="athleteName" width={130} tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as AttendanceRow;
                  return <ChartTooltip title={r.athleteName} lines={[`${r.pct}% attended`, `${r.present} present · ${r.late} late · ${r.absent} absent`]} />;
                }}
              />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {sorted.map((r) => <Cell key={r.athleteId} fill={pctColor(r.pct)} />)}
                <LabelList dataKey="pct" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: "var(--foreground)" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <SortableTable rows={data} columns={COLUMNS} rowKey={(r) => r.athleteId} initialSort={{ key: "pct", dir: "desc" }} />
    </div>
  );
}
