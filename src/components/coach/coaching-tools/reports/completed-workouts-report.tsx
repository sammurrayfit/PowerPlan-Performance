"use client";

import { useState } from "react";
import Link from "next/link";
import type { CompletedWorkoutRow } from "@/app/(coach)/coach/coaching-tools/reports/actions";
import { StatCards, EmptyState, SortableTable, shortDate, type Column } from "./report-ui";

interface Props {
  rows: CompletedWorkoutRow[];
  backHref?: string;
  // Headline tiles and status filter; the dashboard embeds just the table.
  summary?: boolean;
}

type Status = "completed" | "partial" | "none";

function statusOf(row: CompletedWorkoutRow): Status {
  if (row.totalExercises > 0 && row.loggedExercises >= row.totalExercises) return "completed";
  if (row.loggedExercises > 0) return "partial";
  return "none";
}

const STATUS_META: Record<Status, { label: string; className: string }> = {
  completed: { label: "Completed",  className: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" },
  partial:   { label: "Partial",    className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  none:      { label: "Not logged", className: "bg-muted text-muted-foreground" },
};

function attendanceLabel(status: CompletedWorkoutRow["attendanceStatus"]): string {
  if (status === "present") return "Present";
  if (status === "late") return "Late";
  if (status === "absent") return "Absent";
  return "—";
}

export function CompletedWorkoutsReport({ rows, backHref = "/coach/coaching-tools/reports", summary = false }: Props) {
  const [filter, setFilter] = useState<Status | "all">("all");

  if (rows.length === 0) {
    return <EmptyState>No workouts in this period.</EmptyState>;
  }

  const counts = { completed: 0, partial: 0, none: 0 };
  for (const r of rows) counts[statusOf(r)]++;
  const visible = filter === "all" ? rows : rows.filter((r) => statusOf(r) === filter);

  const columns: Column<CompletedWorkoutRow>[] = [
    { key: "date", header: "Date", cell: (r) => <span className="whitespace-nowrap">{shortDate(r.date)}</span>, sort: (r) => r.date },
    { key: "athlete", header: "Athlete", cell: (r) => <span className="font-medium">{r.athleteName}</span>, sort: (r) => r.athleteName },
    { key: "title", header: "Workout", cell: (r) => r.title, sort: (r) => r.title },
    { key: "att", header: "Attendance", cell: (r) => <span className="text-muted-foreground">{attendanceLabel(r.attendanceStatus)}</span>, sort: (r) => r.attendanceStatus ?? "" },
    {
      key: "logged", header: "Logged", align: "right",
      sort: (r) => (r.totalExercises ? r.loggedExercises / r.totalExercises : 0),
      cell: (r) => <span className="text-muted-foreground">{r.loggedExercises}/{r.totalExercises}</span>,
    },
    {
      key: "status", header: "Status", sort: (r) => ["completed", "partial", "none"].indexOf(statusOf(r)),
      cell: (r) => {
        const m = STATUS_META[statusOf(r)];
        return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${m.className}`}>{m.label}</span>;
      },
    },
    {
      key: "view", header: "",
      cell: (r) => (
        <Link
          href={`/coach/calendar/${r.calendarId}/workout/${r.workoutId}?tab=logged&back=${encodeURIComponent(backHref)}`}
          className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {summary && (
        <>
          <StatCards stats={[
            { label: "Sessions", value: rows.length, hint: `${new Set(rows.map((r) => r.athleteId)).size} athletes` },
            { label: "Completion rate", value: `${Math.round((counts.completed / rows.length) * 100)}%`, hint: "every exercise logged" },
            { label: "Partial", value: counts.partial },
            { label: "Not logged", value: counts.none },
          ]} />
          <div className="flex flex-wrap gap-1.5">
            {(["all", "completed", "partial", "none"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === s ? "bg-foreground text-background border-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {s === "all" ? `All (${rows.length})` : `${STATUS_META[s].label} (${counts[s]})`}
              </button>
            ))}
          </div>
        </>
      )}
      <SortableTable
        rows={visible}
        columns={columns}
        rowKey={(r) => `${r.workoutId}|${r.athleteId}`}
        initialSort={{ key: "date", dir: "desc" }}
      />
    </div>
  );
}
