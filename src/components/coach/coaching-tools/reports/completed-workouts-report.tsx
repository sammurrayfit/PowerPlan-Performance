"use client";

import Link from "next/link";
import type { CompletedWorkoutRow } from "@/app/(coach)/coach/coaching-tools/reports/actions";

interface Props {
  rows: CompletedWorkoutRow[];
}

function StatusBadge({ row }: { row: CompletedWorkoutRow }) {
  if (row.totalExercises > 0 && row.loggedExercises >= row.totalExercises) {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
        Completed
      </span>
    );
  }
  if (row.loggedExercises > 0) {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
        Partial
      </span>
    );
  }
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
      Not logged
    </span>
  );
}

function attendanceLabel(status: CompletedWorkoutRow["attendanceStatus"]): string {
  if (status === "present") return "Present";
  if (status === "late") return "Late";
  if (status === "absent") return "Absent";
  return "—";
}

export function CompletedWorkoutsReport({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No workouts in this period.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Athlete</th>
            <th className="px-3 py-2 text-left">Workout</th>
            <th className="px-3 py-2 text-left">Attendance</th>
            <th className="px-3 py-2 text-left">Logged</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.workoutId}|${r.athleteId}`} className="border-t">
              <td className="px-3 py-2 whitespace-nowrap">
                {new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </td>
              <td className="px-3 py-2">{r.athleteName}</td>
              <td className="px-3 py-2">{r.title}</td>
              <td className="px-3 py-2 text-muted-foreground">{attendanceLabel(r.attendanceStatus)}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {r.loggedExercises}/{r.totalExercises}
              </td>
              <td className="px-3 py-2"><StatusBadge row={r} /></td>
              <td className="px-3 py-2">
                <Link
                  href={`/coach/calendar/${r.calendarId}/workout/${r.workoutId}?tab=logged&back=${encodeURIComponent("/coach/coaching-tools/reports")}`}
                  className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
