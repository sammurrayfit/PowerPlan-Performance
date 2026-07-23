"use client";

interface LoggedSet {
  set_number: number;
  reps_completed: number | null;
  load_completed: number | null;
  rpe: number | null;
}

export interface AthleteLog {
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
  athletes: AthleteLog[];
}

function rpeColor(rpe: number): string {
  if (rpe <= 3) return "text-green-700 dark:text-green-400";
  if (rpe <= 6) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

export function LoggedResultsTable({ exercises, athletes }: Props) {
  if (athletes.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="font-medium">No athletes linked</p>
        <p className="text-sm mt-1">Link a team to this calendar to see logged results per athlete.</p>
      </div>
    );
  }

  if (exercises.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">Add exercises to the workout first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        What each athlete actually logged for this workout — reps × weight, with RPE where recorded.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="text-sm w-max min-w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-xs text-muted-foreground sticky left-0 bg-muted/50 min-w-[140px]">
                Athlete
              </th>
              {exercises.map((ex) => (
                <th key={ex.id} className="px-3 py-2 text-left font-medium text-xs min-w-[140px]">
                  <div className="font-medium truncate max-w-[130px]">{ex.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => (
              <tr key={athlete.athleteId} className="border-t">
                <td className="px-3 py-2 font-medium sticky left-0 bg-background text-sm">
                  {athlete.athleteName}
                </td>
                {exercises.map((ex) => {
                  const sets = athlete.setsByExercise[ex.id] ?? [];
                  return (
                    <td key={ex.id} className="px-3 py-2 align-top">
                      {sets.length === 0 ? (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      ) : (
                        <div className="space-y-0.5">
                          {sets.map((s) => (
                            <div key={s.set_number} className="text-xs whitespace-nowrap">
                              <span className="font-medium tabular-nums">
                                {s.reps_completed ?? "—"} × {s.load_completed ?? "—"}
                              </span>
                              {s.rpe != null && (
                                <span className={`ml-1 font-medium ${rpeColor(s.rpe)}`}>
                                  RPE {s.rpe}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
