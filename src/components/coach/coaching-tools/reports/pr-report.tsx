"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { PRRow } from "@/app/(coach)/coach/coaching-tools/reports/actions";
import { StatCards, ChartCard, ChartTooltip, EmptyState, SortableTable, SERIES_1, AXIS_TICK, GRID_STROKE, shortDate, longDate, type Column } from "./report-ui";

const COLUMNS: Column<PRRow>[] = [
  { key: "date", header: "Date", cell: (r) => <span className="text-muted-foreground whitespace-nowrap">{longDate(r.date)}</span>, sort: (r) => r.date },
  { key: "athlete", header: "Athlete", cell: (r) => <span className="font-medium">{r.athleteName}</span>, sort: (r) => r.athleteName },
  { key: "exercise", header: "Exercise", cell: (r) => <span className="text-muted-foreground">{r.exerciseName}</span>, sort: (r) => r.exerciseName },
  { key: "value", header: "PR", cell: (r) => <span className="font-semibold">{r.value} {r.unit}</span>, sort: (r) => r.value, align: "right" },
];

function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function mostCommon(values: string[]): [string, number] | null {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? null;
}

export function PRReport({ rows }: { rows: PRRow[] }) {
  if (rows.length === 0) {
    return <EmptyState>No PRs recorded for this period.</EmptyState>;
  }

  const byWeek: Record<string, number> = {};
  for (const r of rows) byWeek[weekStart(r.date)] = (byWeek[weekStart(r.date)] ?? 0) + 1;
  const weeks = Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b)).map(([week, count]) => ({ week, count }));

  const topExercise = mostCommon(rows.map((r) => r.exerciseName));
  const topAthlete = mostCommon(rows.map((r) => r.athleteName));
  const athleteCount = new Set(rows.map((r) => r.athleteId)).size;

  return (
    <div className="space-y-4">
      <StatCards stats={[
        { label: "PRs set", value: rows.length },
        { label: "Athletes with a PR", value: athleteCount },
        { label: "Top exercise", value: topExercise?.[1] ?? 0, hint: topExercise?.[0] },
        { label: "Most PRs", value: topAthlete?.[1] ?? 0, hint: topAthlete?.[0] },
      ]} />

      {weeks.length > 1 && (
        <ChartCard title="PRs per week" subtitle="By week starting">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeks} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="week" tickFormatter={shortDate} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const w = payload[0].payload as { week: string; count: number };
                  return <ChartTooltip title={`Week of ${shortDate(w.week)}`} lines={[`${w.count} PR${w.count === 1 ? "" : "s"}`]} />;
                }}
              />
              <Bar dataKey="count" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <SortableTable rows={rows} columns={COLUMNS} rowKey={(r) => `${r.athleteId}|${r.exerciseId}|${r.date}|${r.value}`} initialSort={{ key: "date", dir: "desc" }} />
    </div>
  );
}
