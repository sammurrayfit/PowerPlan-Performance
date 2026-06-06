import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Medal } from "lucide-react";
import { AthleteMaxes } from "@/components/athlete/athlete-maxes";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── page ──────────────────────────────────────────────────────────────────────

export default async function PRsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: prs },
    { data: allMaxes },
    { data: allExercises },
  ] = await Promise.all([
    // All PRs for this athlete, newest first
    supabase
      .from("personal_records")
      .select("id, exercise_id, value, unit, date_achieved, exercises(name)")
      .eq("athlete_id", user.id)
      .order("date_achieved", { ascending: false }),

    // All maxes for this athlete, newest first
    supabase
      .from("maxes")
      .select("id, exercise_id, value, unit, date_recorded, exercises(name)")
      .eq("athlete_id", user.id)
      .order("date_recorded", { ascending: false }),

    // All exercises for the add-max search
    supabase
      .from("exercises")
      .select("id, name")
      .order("name"),
  ]);

  // ── Group PRs: best value per exercise ──────────────────────────────────────
  type BestPR = {
    exerciseId: string;
    exerciseName: string;
    best: number;
    unit: string;
    bestDate: string;
    totalPRs: number;
  };

  const bestMap: Record<string, BestPR> = {};
  for (const pr of prs ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = (pr.exercises as any)?.name ?? "Unknown";
    if (!bestMap[pr.exercise_id]) {
      bestMap[pr.exercise_id] = {
        exerciseId: pr.exercise_id,
        exerciseName: name,
        best: pr.value,
        unit: pr.unit,
        bestDate: pr.date_achieved,
        totalPRs: 0,
      };
    }
    if (pr.value > bestMap[pr.exercise_id].best) {
      bestMap[pr.exercise_id].best = pr.value;
      bestMap[pr.exercise_id].bestDate = pr.date_achieved;
    }
    bestMap[pr.exercise_id].totalPRs++;
  }
  const bestList = Object.values(bestMap).sort((a, b) => b.best - a.best);

  // ── Build maxes for AthleteMaxes component ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxEntries = (allMaxes ?? [] as any[]).map((m: any) => ({
    id: m.id,
    exercise_id: m.exercise_id,
    exerciseName: (m.exercises as { name: string } | null)?.name ?? "Unknown",
    value: m.value,
    unit: m.unit,
    date: m.date_recorded,
  }));

  // Current max per exercise (first occurrence since ordered desc = most recent)
  const seenExercises = new Set<string>();
  const currentMaxes: typeof maxEntries = [];
  const maxHistory: typeof maxEntries = [];
  for (const m of maxEntries) {
    if (!seenExercises.has(m.exercise_id)) {
      seenExercises.add(m.exercise_id);
      currentMaxes.push(m);
    } else {
      maxHistory.push(m);
    }
  }
  // history includes all entries (current + older) for expand UI
  const allMaxEntries = maxEntries;

  // ── Recent PRs feed (last 10) ─────────────────────────────────────────────
  const recentPRs = (prs ?? []).slice(0, 10).map((pr) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exerciseName: (pr.exercises as any)?.name ?? "Unknown",
    value: pr.value,
    unit: pr.unit,
    date: pr.date_achieved,
  }));

  const hasPRs = bestList.length > 0;
  const hasMaxes = currentMaxes.length > 0;
  const hasAnything = hasPRs || hasMaxes;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold">Personal Records</h1>
        <p className="text-sm text-muted-foreground">Your all-time bests.</p>
      </div>

      {!hasAnything && (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Trophy className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <p className="font-medium">No records yet</p>
            <p className="text-sm text-muted-foreground">
              Complete a workout to track PRs, or add a max below.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Best lifts (from personal_records) ── */}
      {hasPRs && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            <h2 className="text-sm font-semibold">Best Lifts</h2>
            <span className="text-xs text-muted-foreground">from logged workouts</span>
          </div>

          <div className="rounded-lg border divide-y overflow-hidden">
            {bestList.map((pr, i) => (
              <div key={pr.exerciseId} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 text-xs font-bold text-muted-foreground text-right shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{pr.exerciseName}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(pr.bestDate)}
                    {pr.totalPRs > 1 && (
                      <span className="ml-1.5 text-primary">· {pr.totalPRs} PRs</span>
                    )}
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums text-green-600 dark:text-green-400">
                  {pr.best} {pr.unit}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 1RM Maxes — interactive, client component ── */}
      <AthleteMaxes
        currentMaxes={currentMaxes}
        maxHistory={allMaxEntries}
        exercises={(allExercises ?? []).map((e) => ({ id: e.id, name: e.name }))}
      />

      {/* ── Recent PR feed ── */}
      {recentPRs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Medal className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold">Recent PRs</h2>
          </div>

          <div className="space-y-2">
            {recentPRs.map((pr, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{pr.exerciseName}</p>
                  <p className="text-xs text-muted-foreground">{fmt(pr.date)}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-green-600 dark:text-green-400 ml-3 shrink-0">
                  {pr.value} {pr.unit}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="pb-2" />
    </div>
  );
}
