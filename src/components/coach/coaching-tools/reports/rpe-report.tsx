"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { RPERow } from "@/app/(coach)/coach/coaching-tools/reports/actions";
import { RPE_LABELS } from "@/lib/rpe";
import { StatCards, ChartCard, ChartTooltip, EmptyState, SortableTable, SERIES_1, SERIES_2, AXIS_TICK, GRID_STROKE, shortDate, longDate, type Column } from "./report-ui";

const avg = (vals: number[]) => (vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null);
const rpeLabel = (v: number) => RPE_LABELS[Math.round(v)] ?? "";

const COLUMNS: Column<RPERow>[] = [
  { key: "date", header: "Date", cell: (r) => <span className="text-muted-foreground whitespace-nowrap">{longDate(r.date)}</span>, sort: (r) => r.date },
  { key: "athlete", header: "Athlete", cell: (r) => <span className="font-medium">{r.athleteName}</span>, sort: (r) => r.athleteName },
  { key: "workout", header: "Workout", cell: (r) => <span className="text-muted-foreground">{r.workoutTitle}</span>, sort: (r) => r.workoutTitle },
  { key: "pre", header: "Pre", cell: (r) => (r.rpe_pre != null ? `${r.rpe_pre}/10` : "—"), sort: (r) => r.rpe_pre ?? -1, align: "right" },
  { key: "post", header: "Post", cell: (r) => (r.rpe_post != null ? `${r.rpe_post}/10` : "—"), sort: (r) => r.rpe_post ?? -1, align: "right" },
  {
    key: "delta", header: "Δ", align: "right",
    sort: (r) => (r.rpe_pre != null && r.rpe_post != null ? r.rpe_post - r.rpe_pre : -99),
    cell: (r) => {
      if (r.rpe_pre == null || r.rpe_post == null) return <span className="text-muted-foreground">—</span>;
      const d = r.rpe_post - r.rpe_pre;
      return <span className="text-muted-foreground">{d > 0 ? `+${d}` : d}</span>;
    },
  },
];

export function RPEReport({ rows }: { rows: RPERow[] }) {
  if (rows.length === 0) {
    return <EmptyState>No RPE data for this period. Athletes submit pre-workout RPE when they open a locked workout.</EmptyState>;
  }

  // One point per day: the average across the selected athletes.
  const byDate: Record<string, { pre: number[]; post: number[] }> = {};
  for (const r of rows) {
    const d = (byDate[r.date] ??= { pre: [], post: [] });
    if (r.rpe_pre != null) d.pre.push(r.rpe_pre);
    if (r.rpe_post != null) d.post.push(r.rpe_post);
  }
  const points = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, pre: avg(v.pre), post: avg(v.post), n: Math.max(v.pre.length, v.post.length) }));

  const pre = avg(rows.flatMap((r) => (r.rpe_pre != null ? [r.rpe_pre] : [])));
  const post = avg(rows.flatMap((r) => (r.rpe_post != null ? [r.rpe_post] : [])));
  const hard = rows.filter((r) => (r.rpe_post ?? 0) >= 8).length;

  return (
    <div className="space-y-4">
      <StatCards stats={[
        { label: "Avg pre-workout RPE", value: pre ?? "—", hint: pre != null ? rpeLabel(pre) : undefined },
        { label: "Avg post-workout RPE", value: post ?? "—", hint: post != null ? rpeLabel(post) : undefined },
        { label: "Check-ins", value: rows.length, hint: `${new Set(rows.map((r) => r.athleteId)).size} athletes` },
        { label: "Hard sessions", value: hard, hint: "post RPE 8+" },
      ]} />

      {points.length > 1 && (
        <ChartCard title="RPE by day" subtitle="Average across selected athletes">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={points} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof points)[number];
                return (
                  <ChartTooltip
                    title={longDate(p.date)}
                    lines={[
                      p.pre != null ? `Pre: ${p.pre} — ${rpeLabel(p.pre)}` : "Pre: —",
                      p.post != null ? `Post: ${p.post} — ${rpeLabel(p.post)}` : "Post: —",
                      `${p.n} athlete${p.n === 1 ? "" : "s"}`,
                    ]}
                  />
                );
              }} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--foreground)" }} />
              <Line name="Pre-workout (readiness)" dataKey="pre" stroke={SERIES_1} strokeWidth={2} dot={{ r: 4, fill: SERIES_1, strokeWidth: 2, stroke: "var(--card)" }} connectNulls />
              <Line name="Post-workout (effort)" dataKey="post" stroke={SERIES_2} strokeWidth={2} dot={{ r: 4, fill: SERIES_2, strokeWidth: 2, stroke: "var(--card)" }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <SortableTable rows={rows} columns={COLUMNS} rowKey={(r) => `${r.athleteId}|${r.date}|${r.workoutTitle}`} initialSort={{ key: "date", dir: "desc" }} />
    </div>
  );
}
