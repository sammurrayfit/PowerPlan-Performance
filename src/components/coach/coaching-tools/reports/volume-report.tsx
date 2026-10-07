"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { VolumeWeek, VolumeAthlete, VolumeRow } from "@/app/(coach)/coach/coaching-tools/reports/actions";
import {
  StatCards, ChartCard, ChartTooltip, EmptyState, SortableTable,
  SERIES_1, AXIS_TICK, GRID_STROKE, shortDate, compactNumber, type Column,
} from "./report-ui";

interface Props {
  weeks: VolumeWeek[];
  athletes: VolumeAthlete[];
  rows: VolumeRow[];
}

const TOP_N = 10;

const COLUMNS: Column<VolumeRow>[] = [
  { key: "athlete", header: "Athlete", cell: (r) => <span className="font-medium">{r.athleteName}</span>, sort: (r) => r.athleteName },
  { key: "exercise", header: "Exercise", cell: (r) => <span className="text-muted-foreground">{r.exerciseName}</span>, sort: (r) => r.exerciseName },
  { key: "sets", header: "Sets", cell: (r) => r.totalSets, sort: (r) => r.totalSets, align: "right" },
  { key: "reps", header: "Reps", cell: (r) => r.totalReps, sort: (r) => r.totalReps, align: "right" },
  { key: "vol", header: "Volume (lbs)", cell: (r) => <span className="font-semibold">{r.totalVolume.toLocaleString()}</span>, sort: (r) => r.totalVolume, align: "right" },
];

export function VolumeReport({ weeks, athletes, rows }: Props) {
  if (rows.length === 0) {
    return <EmptyState>No logged sets for this period.</EmptyState>;
  }

  const totalVolume = athletes.reduce((s, a) => s + a.totalVolume, 0);
  const totalSets = athletes.reduce((s, a) => s + a.totalSets, 0);
  const top = athletes.slice(0, TOP_N);

  return (
    <div className="space-y-4">
      <StatCards stats={[
        { label: "Total volume", value: `${compactNumber(totalVolume)} lbs`, hint: "reps × load, timed sets excluded" },
        { label: "Sets logged", value: totalSets.toLocaleString() },
        { label: "Athletes logging", value: athletes.length },
        { label: "Avg per athlete", value: `${compactNumber(Math.round(totalVolume / athletes.length))} lbs` },
      ]} />

      <div className={`grid gap-4 ${athletes.length > 1 ? "lg:grid-cols-2" : ""}`}>
        <ChartCard title="Weekly volume" subtitle={athletes.length > 1 ? "All selected athletes combined, by week starting" : "By week starting"}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weeks} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="weekStart" tickFormatter={shortDate} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const w = payload[0].payload as VolumeWeek;
                  return <ChartTooltip title={`Week of ${shortDate(w.weekStart)}`} lines={[`${w.volume.toLocaleString()} lbs`, `${w.sets.toLocaleString()} sets`]} />;
                }}
              />
              <Bar dataKey="volume" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {athletes.length > 1 && (
          <ChartCard
            title={athletes.length > TOP_N ? `Top ${TOP_N} athletes by volume` : "Volume by athlete"}
            subtitle={athletes.length > TOP_N ? `of ${athletes.length} — full list in the table below` : undefined}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }} barCategoryGap={3}>
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                <XAxis type="number" tickFormatter={compactNumber} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="athleteName" width={130} tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const a = payload[0].payload as VolumeAthlete;
                    return <ChartTooltip title={a.athleteName} lines={[`${a.totalVolume.toLocaleString()} lbs`, `${a.totalSets} sets`]} />;
                  }}
                />
                <Bar dataKey="totalVolume" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      <SortableTable rows={rows} columns={COLUMNS} rowKey={(r) => `${r.athleteId}|${r.exerciseName}`} initialSort={{ key: "vol", dir: "desc" }} />
    </div>
  );
}
