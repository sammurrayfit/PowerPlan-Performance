import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ChevronRight } from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function monthLabel(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

const RPE_LABELS: Record<number, string> = {
  0: "No effort",
  1: "Very easy",
  2: "Easy",
  3: "Moderate",
  4: "Somewhat hard",
  5: "Hard",
  6: "Hard+",
  7: "Very hard",
  8: "Very hard+",
  9: "Max effort",
  10: "Absolute max",
};

// ── page ──────────────────────────────────────────────────────────────────────

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 1. All distinct workouts this athlete has logged sets in
  const { data: logs } = await supabase
    .from("exercise_logs")
    .select("workout_id, workout_exercise_id, set_number")
    .eq("athlete_id", user.id);

  const workoutIds = [...new Set((logs ?? []).map((l) => l.workout_id))];

  if (workoutIds.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">Workout History</h1>
          <p className="text-sm text-muted-foreground">Your completed sessions.</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <p className="font-medium">No history yet</p>
            <p className="text-sm text-muted-foreground">
              Complete a workout and log your sets — it will show up here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. Fetch workout details
  const { data: workouts } = await supabase
    .from("workouts")
    .select("id, title, date, notes, calendar_id")
    .in("id", workoutIds)
    .order("date", { ascending: false });

  // 3. Aggregate sets + exercise counts per workout from logs
  const setsByWorkout: Record<string, number> = {};
  const exercisesByWorkout: Record<string, Set<string>> = {};
  for (const l of logs ?? []) {
    setsByWorkout[l.workout_id] = (setsByWorkout[l.workout_id] ?? 0) + 1;
    if (!exercisesByWorkout[l.workout_id]) exercisesByWorkout[l.workout_id] = new Set();
    exercisesByWorkout[l.workout_id].add(l.workout_exercise_id);
  }

  // 4. Attendance / post-RPE for each workout
  const { data: attendance } = await supabase
    .from("attendance")
    .select("workout_id, rpe_post")
    .in("workout_id", workoutIds)
    .eq("athlete_id", user.id);

  const rpeByWorkout: Record<string, number | null> = {};
  for (const a of attendance ?? []) {
    rpeByWorkout[a.workout_id] = a.rpe_post;
  }

  // 5. Calendar names
  const calendarIds = [...new Set((workouts ?? []).map((w) => w.calendar_id))];
  const { data: calendars } = await supabase
    .from("calendars")
    .select("id, name")
    .in("id", calendarIds);
  const calMap = Object.fromEntries((calendars ?? []).map((c) => [c.id, c.name]));

  // 6. Group workouts by month
  type WorkoutRow = {
    id: string;
    title: string;
    date: string;
    notes: string | null;
    calendar_id: string;
  };

  const byMonth: { label: string; workouts: WorkoutRow[] }[] = [];
  const monthIndexMap: Record<string, number> = {};

  for (const w of workouts ?? []) {
    const label = monthLabel(w.date);
    if (monthIndexMap[label] == null) {
      monthIndexMap[label] = byMonth.length;
      byMonth.push({ label, workouts: [] });
    }
    byMonth[monthIndexMap[label]].workouts.push(w);
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold">Workout History</h1>
        <p className="text-sm text-muted-foreground">
          {workoutIds.length} session{workoutIds.length !== 1 ? "s" : ""} logged
        </p>
      </div>

      {/* ── Month groups ── */}
      {byMonth.map(({ label, workouts: group }) => (
        <section key={label} className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            {label}
          </h2>

          <div className="rounded-lg border divide-y overflow-hidden">
            {group.map((w) => {
              const sets = setsByWorkout[w.id] ?? 0;
              const exCount = exercisesByWorkout[w.id]?.size ?? 0;
              const rpe = rpeByWorkout[w.id];
              const calName = calMap[w.calendar_id];

              return (
                <Link
                  key={w.id}
                  href={`/athlete/workout/${w.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  {/* Date block */}
                  <div className="shrink-0 w-10 text-center">
                    <p className="text-lg font-bold leading-none">
                      {new Date(w.date + "T00:00:00").getDate()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(w.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-10 bg-border shrink-0" />

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{w.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {exCount} exercise{exCount !== 1 ? "s" : ""} · {sets} set{sets !== 1 ? "s" : ""}
                      </span>
                      {calName && (
                        <span className="text-xs text-muted-foreground">· {calName}</span>
                      )}
                    </div>
                    {rpe != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        RPE {rpe} — {RPE_LABELS[rpe] ?? ""}
                      </p>
                    )}
                  </div>

                  {/* RPE badge + chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    {rpe != null && (
                      <Badge
                        variant="outline"
                        className={
                          rpe >= 8
                            ? "border-red-300 text-red-600 dark:text-red-400"
                            : rpe >= 6
                            ? "border-orange-300 text-orange-600 dark:text-orange-400"
                            : "border-green-300 text-green-600 dark:text-green-400"
                        }
                      >
                        RPE {rpe}
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <div className="pb-2" />
    </div>
  );
}
