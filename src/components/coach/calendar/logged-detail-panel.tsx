"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface LoggedSet {
  set_number: number;
  reps_completed: number | null;
  load_completed: number | null;
  rpe: number | null;
}

interface AthleteLogs {
  athleteId: string;
  athleteName: string;
  setsByExercise: Record<string, LoggedSet[]>;
}

interface ExerciseInfo {
  id: string;
  name: string;
}

interface Props {
  exercises: ExerciseInfo[];
  athletes: AthleteLogs[];
}

function rpeColor(rpe: number): string {
  if (rpe <= 3) return "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30";
  if (rpe <= 6) return "text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30";
  return "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30";
}

function totalSets(setsByExercise: Record<string, LoggedSet[]>): number {
  return Object.values(setsByExercise).reduce((sum, sets) => sum + sets.length, 0);
}

export function LoggedDetailPanel({ exercises, athletes }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(athleteId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(athleteId)) next.delete(athleteId);
      else next.add(athleteId);
      return next;
    });
  }

  if (athletes.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground">No athletes are assigned to this calendar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Logged Detail · {athletes.length} Athletes
      </h2>

      <div className="rounded-lg border divide-y">
        {athletes.map((a) => {
          const setCount = totalSets(a.setsByExercise);
          const hasLogs = setCount > 0;
          const isOpen = expanded.has(a.athleteId);

          return (
            <div key={a.athleteId}>
              <button
                onClick={() => hasLogs && toggle(a.athleteId)}
                disabled={!hasLogs}
                className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
              >
                {hasLogs ? (
                  isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )
                ) : (
                  <div className="h-4 w-4 shrink-0" />
                )}
                <span className="font-medium text-sm flex-1 min-w-[120px]">{a.athleteName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${hasLogs ? "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30" : "text-muted-foreground bg-muted"}`}>
                  {hasLogs ? `${setCount} set${setCount === 1 ? "" : "s"} logged` : "Not started"}
                </span>
              </button>

              {isOpen && hasLogs && (
                <div className="px-4 pb-4 pl-11 space-y-3">
                  {exercises
                    .filter((e) => a.setsByExercise[e.id]?.length > 0)
                    .map((e) => (
                      <div key={e.id} className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">{e.name}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {a.setsByExercise[e.id].map((s) => (
                            <span
                              key={s.set_number}
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border bg-muted/40"
                            >
                              <span className="text-muted-foreground">#{s.set_number}</span>
                              <span className="font-medium tabular-nums">
                                {s.reps_completed ?? "—"} × {s.load_completed ?? "—"} lb
                              </span>
                              {s.rpe != null && (
                                <span className={`px-1.5 rounded-full font-medium ${rpeColor(s.rpe)}`}>
                                  RPE {s.rpe}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
