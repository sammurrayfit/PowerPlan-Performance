"use client";

import type { ReactNode } from "react";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { MaxRow } from "@/app/(coach)/coach/coaching-tools/reports/actions";
import { StatCards, ChartCard, ChartTooltip, EmptyState, SortableTable, SERIES_1, AXIS_TICK, GRID_STROKE, shortDate, longDate, type Column } from "./report-ui";

interface Props {
  rows: MaxRow[];
  singleAthlete: boolean;
  singleExercise: boolean;
}

const change = (r: MaxRow) => r.current - (r.history[0]?.value ?? r.current);

const COLUMNS: Column<MaxRow>[] = [
  { key: "athlete", header: "Athlete", cell: (r) => <span className="font-medium">{r.athleteName}</span>, sort: (r) => r.athleteName },
  { key: "exercise", header: "Exercise", cell: (r) => <span className="text-muted-foreground">{r.exerciseName}</span>, sort: (r) => r.exerciseName },
  { key: "current", header: "Current max", cell: (r) => <span className="font-semibold">{r.current} {r.unit}</span>, sort: (r) => r.current, align: "right" },
  {
    key: "change", header: "Change", align: "right", sort: change,
    cell: (r) => {
      const c = change(r);
      return (
        <span className={`font-medium ${c > 0 ? "text-green-600 dark:text-green-400" : c < 0 ? "text-red-500" : "text-muted-foreground"}`}>
          {c > 0 ? `▲ +${c} ${r.unit}` : c < 0 ? `▼ ${c} ${r.unit}` : "—"}
        </span>
      );
    },
  },
  { key: "tested", header: "Last tested", cell: (r) => <span className="text-muted-foreground whitespace-nowrap">{longDate(r.history.at(-1)!.date)}</span>, sort: (r) => r.history.at(-1)!.date, align: "right" },
  { key: "entries", header: "Entries", cell: (r) => <span className="text-muted-foreground">{r.history.length}</span>, sort: (r) => r.history.length, align: "right" },
];

export function MaxProgressionReport({ rows, singleAthlete, singleExercise }: Props) {
  if (rows.length === 0) {
    return <EmptyState>No maxes recorded for the selected filters.</EmptyState>;
  }

  const improved = rows.filter((r) => change(r) > 0).length;
  const retested = rows.filter((r) => r.history.length > 1).length;

  // Maxes only compare within one exercise, so the chart needs one fixed:
  // one athlete + one exercise -> history line; one exercise -> athletes
  // ranked; one athlete -> their exercises.
  let chart: ReactNode = null;
  if (singleAthlete && singleExercise) {
    const r = rows[0];
    chart = r.history.length > 1 && (
      <ChartCard title={`${r.exerciseName} — ${r.athleteName}`} subtitle={`Max over time (${r.unit})`}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={r.history} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis domain={["auto", "auto"]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { date: string; value: number };
              return <ChartTooltip title={longDate(p.date)} lines={[`${p.value} ${r.unit}`]} />;
            }} />
            <Line dataKey="value" stroke={SERIES_1} strokeWidth={2} dot={{ r: 4, fill: SERIES_1, strokeWidth: 2, stroke: "var(--card)" }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  } else if (singleExercise || singleAthlete) {
    const data = [...rows].sort((a, b) => b.current - a.current);
    const label = (r: MaxRow) => (singleExercise ? r.athleteName : r.exerciseName);
    const units = new Set(data.map((r) => r.unit));
    chart = data.length > 1 && units.size === 1 && (
      <ChartCard
        title={singleExercise ? `${data[0].exerciseName} — current max by athlete` : `${data[0].athleteName} — current maxes`}
        subtitle={[...units][0]}
      >
        <ResponsiveContainer width="100%" height={data.length * 26 + 32}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }} barCategoryGap={3}>
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey={singleExercise ? "athleteName" : "exerciseName"} width={150} tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as MaxRow;
                const c = change(r);
                return <ChartTooltip title={label(r)} lines={[`${r.current} ${r.unit}`, c ? `${c > 0 ? "+" : ""}${c} ${r.unit} since first test` : "first test"]} />;
              }}
            />
            <Bar dataKey="current" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  return (
    <div className="space-y-4">
      <StatCards stats={[
        { label: "Athletes tested", value: new Set(rows.map((r) => r.athleteId)).size },
        { label: "Exercises", value: new Set(rows.map((r) => r.exerciseId)).size },
        { label: "Retested", value: retested, hint: "more than one entry" },
        { label: "Improved", value: improved, hint: retested ? `${Math.round((improved / retested) * 100)}% of retests` : undefined },
      ]} />
      {chart}
      {!singleAthlete && !singleExercise && (
        <p className="text-xs text-muted-foreground">Pick an exercise or an athlete above to chart maxes.</p>
      )}
      <SortableTable rows={rows} columns={COLUMNS} rowKey={(r) => `${r.athleteId}|${r.exerciseId}`} initialSort={{ key: "current", dir: "desc" }} />
    </div>
  );
}
