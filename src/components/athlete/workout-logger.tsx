"use client";

import { Fragment, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { autoRecordPR, epley1RM, isTimedReps } from "@/lib/pr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Play, Flag, Zap, Dumbbell, Timer } from "lucide-react";
import Link from "next/link";
import { RPE_LABELS, RPE_OPTIONS } from "@/lib/rpe";

interface Override {
  sets?: number | null;
  reps?: string | null;
  load?: number | null;
  load_type?: string | null;
  notes?: string | null;
}

interface ExerciseLog {
  id: string;
  set_number: number;
  reps_completed: number | null;
  load_completed: number | null;
  rpe: number | null;
}

interface PreviousSet {
  set_number: number;
  reps: number | null;
  load: number | null;
  rpe: number | null;
}

interface Exercise {
  id: string;
  exercise_id: string;
  exercise_name: string;
  video_url: string | null;
  image_url: string | null;
  sort_order: number;
  sets: number | null;
  reps: string | null;
  load: number | null;
  load_type: string | null;
  tempo: string | null;
  rest_seconds: number | null;
  notes: string | null;
  superset_group: string | null;
  is_pre_activation: boolean;
  override: Override | null;
  max: number | null;
  logs: ExerciseLog[];
  previousSession: { date: string; sets: PreviousSet[] } | null;
}

interface Workout {
  id: string;
  title: string;
  date: string;
  notes: string | null;
  is_locked: boolean;
  prevWorkoutId?: string | null;
  nextWorkoutId?: string | null;
}

interface SetRow {
  reps: string;
  load: string;
  rpe: string;
  saved: boolean;
  logId: string | null;
  // True once the athlete has actually edited this row. reps/load start
  // pre-filled with the prescribed defaults (see buildInitialRows below) so
  // the row isn't blank, but that pre-fill must never be saved on its own —
  // only a real edit should trigger a save on blur.
  touched: boolean;
}

function calcWeight(load: number | null, loadType: string | null, max: number | null): number | null {
  if (load == null || loadType !== "percent_1rm" || max == null) return null;
  return Math.round((load / 100) * max);
}

// The weight to pre-fill into an unlogged set: the computed %1RM weight, or
// the prescribed weight itself for a flat/absolute prescription.
function defaultLoad(load: number | null, loadType: string | null, calcLbs: number | null): number | null {
  if (loadType === "percent_1rm") return calcLbs;
  if (loadType === "absolute") return load;
  return null;
}

// The reps to pre-fill into an unlogged set. A comma-separated prescription
// ("6,5,5,4") gives a different target per set, so pick the entry matching
// this set's index; otherwise fall back to the leading number in the
// prescription ("8" -> 8, "6 each" -> 6), or none for non-numeric
// prescriptions ("AMRAP") where a default would be misleading.
function defaultReps(prescribedReps: string, setIndex: number): string {
  const parts = prescribedReps.split(",").map((p) => p.trim());
  const target = parts.length > 1 ? (parts[setIndex] ?? parts[parts.length - 1]) : prescribedReps;
  const n = parseInt(target, 10);
  return Number.isNaN(n) ? "" : String(n);
}

// Badge text for a prescription. Bare counts get "reps" ("8" -> "8 reps",
// "5 each" -> "5 reps each"); anything already carrying its own unit
// ("10 sec", "10 yd", "8 steps") is shown as written.
function prescriptionLabel(reps: string): string {
  if (/^[\d\s,\-]+$/.test(reps)) return `${reps} reps`;
  const each = reps.match(/^([\d\s,\-]+?)\s*each$/i);
  if (each) return `${each[1]} reps each`;
  return reps;
}

// The "D" superset group is a convention for optional accessory work, shown
// after the required A/B/C blocks. Flag the exercise that starts that block
// so a divider can be rendered just above it.
function startsOptionalBlock(group: string | null, prevGroup: string | null): boolean {
  const g = (group ?? "").trim().toUpperCase();
  const prev = (prevGroup ?? "").trim().toUpperCase();
  return g.startsWith("D") && !prev.startsWith("D");
}

function supersetColor(group: string): string {
  const idx = group.toUpperCase().charCodeAt(0) - 65;
  return `hsl(${idx * 37 + 200}, 70%, 50%)`;
}

function ExerciseCard({
  exercise,
  athleteId,
  workoutId,
  workoutDate,
  onSaveSet,
  onProgress,
}: {
  exercise: Exercise;
  athleteId: string;
  workoutId: string;
  workoutDate: string;
  onSaveSet?: SaveSetFn;
  onProgress?: (exerciseId: string, completed: number) => void;
}) {
  const supabase = createClient();

  const effectiveSets = exercise.override?.sets ?? exercise.sets ?? 1;
  const effectiveReps = exercise.override?.reps ?? exercise.reps ?? "";
  const effectiveLoad = exercise.override?.load ?? exercise.load;
  const effectiveLoadType = exercise.override?.load_type ?? exercise.load_type;
  const calcLbs = calcWeight(effectiveLoad, effectiveLoadType, exercise.max);
  const suggestedLoad = defaultLoad(effectiveLoad, effectiveLoadType, calcLbs);
  const timed = isTimedReps(effectiveReps);

  const buildInitialRows = useCallback((): SetRow[] => {
    return Array.from({ length: effectiveSets }, (_, i) => {
      const existing = exercise.logs.find((l) => l.set_number === i + 1);
      return {
        reps: existing?.reps_completed != null ? String(existing.reps_completed) : defaultReps(effectiveReps, i),
        load: existing?.load_completed != null ? String(existing.load_completed) : suggestedLoad != null ? String(suggestedLoad) : "",
        rpe: existing?.rpe != null ? String(existing.rpe) : "",
        saved: !!existing,
        logId: existing?.id ?? null,
        touched: false,
      };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = useState<SetRow[]>(buildInitialRows);

  function updateRow(index: number, field: keyof Pick<SetRow, "reps" | "load" | "rpe">, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value, saved: false, touched: true };
      return next;
    });
  }

  async function saveSet(index: number) {
    const row = rows[index];
    const repsNum = row.reps !== "" ? parseInt(row.reps, 10) : null;
    const loadNum = row.load !== "" ? parseFloat(row.load) : null;
    const rpeNum = row.rpe !== "" ? parseInt(row.rpe, 10) : null;

    try {
      if (onSaveSet) {
        // Coach-authenticated path (weightroom kiosk) — uses server action to bypass RLS
        const result = await onSaveSet({
          workoutExerciseId: exercise.id,
          athleteId,
          workoutId,
          setNumber: index + 1,
          repsCompleted: repsNum,
          loadCompleted: loadNum,
          rpe: rpeNum,
          existingLogId: row.logId,
        });
        setRows((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], saved: true, logId: result?.id ?? row.logId };
          return next;
        });
      } else if (row.logId) {
        // Athlete-authenticated path — direct Supabase (RLS allows own logs)
        const { error } = await supabase
          .from("exercise_logs")
          .update({ reps_completed: repsNum, load_completed: loadNum, rpe: rpeNum })
          .eq("id", row.logId);
        if (error) throw error;
        setRows((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], saved: true };
          return next;
        });
        await maybeRecordPR(repsNum, loadNum);
      } else {
        const { data, error } = await supabase
          .from("exercise_logs")
          .insert({
            workout_exercise_id: exercise.id,
            athlete_id: athleteId,
            workout_id: workoutId,
            set_number: index + 1,
            reps_completed: repsNum,
            load_completed: loadNum,
            rpe: rpeNum,
          })
          .select("id")
          .single();
        if (error) throw error;
        setRows((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], saved: true, logId: data?.id ?? null };
          return next;
        });
        await maybeRecordPR(repsNum, loadNum);
      }
    } catch {
      toast.error("Failed to save set");
    }
  }

  // A completed set (reps + load both logged) is a PR candidate — check its
  // Epley-estimated 1RM against the athlete's best on file for this exercise.
  // Only reachable on the athlete-authenticated path; the coach kiosk path
  // (onSaveSet) records PRs server-side in saveKioskSet instead.
  async function maybeRecordPR(reps: number | null, load: number | null) {
    // A timed set logs seconds held, which Epley would misread as reps.
    if (reps == null || load == null || timed) return;
    try {
      const estimate = epley1RM(load, reps);
      await autoRecordPR(supabase, athleteId, exercise.exercise_id, estimate, "lbs", workoutDate);
    } catch {
      // The set itself already saved successfully — don't surface a PR-check
      // failure as a save error.
    }
  }

  const loadLabel = effectiveLoadType === "percent_1rm"
    ? `${effectiveLoad ?? ""}%${calcLbs != null ? ` = ${calcLbs} lbs` : ""}`
    : effectiveLoadType === "bodyweight"
    ? "Bodyweight"
    : effectiveLoad != null
    ? `${effectiveLoad} lbs`
    : "";

  const completedCount = rows.filter((r) => r.saved).length;
  const [demoOpen, setDemoOpen] = useState(false);
  const hasDemo = !!(exercise.video_url || exercise.image_url);

  useEffect(() => {
    onProgress?.(exercise.id, completedCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCount, exercise.id]);

  const supersetBorderColor = exercise.superset_group && !exercise.is_pre_activation
    ? supersetColor(exercise.superset_group)
    : undefined;

  return (
    <Card
      className="overflow-hidden border-l-4"
      style={{ borderLeftColor: supersetBorderColor ?? "transparent" }}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {exercise.superset_group && !exercise.is_pre_activation && (
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded"
                style={{
                  color: supersetColor(exercise.superset_group),
                  border: `1px solid ${supersetColor(exercise.superset_group)}`,
                }}
              >
                {exercise.superset_group}
              </span>
            )}
            <CardTitle className="text-base">{exercise.exercise_name}</CardTitle>
          </div>
          {!exercise.is_pre_activation && (
            <span
              className={`text-xs font-medium shrink-0 px-2 py-0.5 rounded-full ${
                completedCount === effectiveSets && effectiveSets > 0
                  ? "bg-green-500/15 text-green-600 dark:text-green-400"
                  : "text-muted-foreground"
              }`}
            >
              {completedCount}/{effectiveSets} sets
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-1">
          {exercise.is_pre_activation ? (
            // Pre-Activation cards have no set rows or set counter, so the
            // prescription itself has to carry the set count.
            <Badge variant="outline">
              {effectiveReps ? `${effectiveSets} × ${effectiveReps}` : `${effectiveSets} ${effectiveSets === 1 ? "set" : "sets"}`}
            </Badge>
          ) : (
            effectiveReps && (
              timed ? (
                <Badge variant="outline" className="gap-1 border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  <Timer className="h-3 w-3" />
                  {effectiveReps}
                </Badge>
              ) : (
                <Badge variant="outline">{prescriptionLabel(effectiveReps)}</Badge>
              )
            )
          )}
          {loadLabel && <Badge variant="outline">{loadLabel}</Badge>}
          {exercise.tempo && <Badge variant="outline">Tempo: {exercise.tempo}</Badge>}
          {exercise.rest_seconds && <Badge variant="outline">Rest: {exercise.rest_seconds}s</Badge>}
        </div>

        {exercise.override?.notes && (
          <p className="text-xs text-blue-500 mt-1">Coach note: {exercise.override.notes}</p>
        )}
        {!exercise.override?.notes && exercise.notes && (
          <p className="text-xs text-muted-foreground mt-1">{exercise.notes}</p>
        )}

        {hasDemo && (
          <button
            onClick={() => setDemoOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-primary mt-2"
          >
            <Play className="w-3 h-3" />
            Demo
            {demoOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </CardHeader>

      {demoOpen && hasDemo && (
        <div className="px-4 pb-3">
          {exercise.video_url ? (
            <video
              src={exercise.video_url}
              controls
              className="w-full rounded-md max-h-64 object-contain bg-black"
              playsInline
            />
          ) : exercise.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={exercise.image_url}
              alt={`${exercise.exercise_name} demo`}
              className="w-full rounded-md max-h-64 object-contain"
            />
          ) : null}
        </div>
      )}

      {!exercise.is_pre_activation && (
      <CardContent className="px-4 pb-4">
        <div className="space-y-2">
          {/* Column headers */}
          <div className={`grid gap-1 text-xs text-muted-foreground px-1 ${exercise.previousSession ? "grid-cols-[2rem_1fr_1fr_1fr_auto_2.25rem]" : "grid-cols-[2rem_1fr_1fr_1fr_2.25rem]"}`}>
            <span>Set</span>
            <span className={timed ? "text-amber-700 dark:text-amber-400 font-medium" : undefined}>{timed ? "Seconds" : "Reps"}</span>
            <span>Load (lbs)</span>
            <span>RPE</span>
            {exercise.previousSession && <span className="text-primary font-medium">Last</span>}
            <span />
          </div>

          {rows.map((row, i) => {
            const prev = exercise.previousSession?.sets.find((s) => s.set_number === i + 1);
            const prevLabel = prev
              ? [prev.load != null ? `${prev.load}lb` : null, prev.reps != null ? (timed ? `${prev.reps}s` : `×${prev.reps}`) : null]
                  .filter(Boolean).join(" ") || "—"
              : null;

            return (
              <div
                key={i}
                className={`grid gap-1 items-center rounded-md -mx-1 px-1 py-0.5 transition-colors ${exercise.previousSession ? "grid-cols-[2rem_1fr_1fr_1fr_auto_2.25rem]" : "grid-cols-[2rem_1fr_1fr_1fr_2.25rem]"} ${
                  row.saved ? "bg-green-500/[0.06]" : ""
                }`}
              >
                <span className="text-sm text-muted-foreground text-center">{i + 1}</span>
                <Input
                  className="h-10 text-sm"
                  type="number"
                  min={0}
                  placeholder={defaultReps(effectiveReps, i) || effectiveReps || "—"}
                  value={row.reps}
                  onChange={(e) => updateRow(i, "reps", e.target.value)}
                  onBlur={() => { if (row.touched) saveSet(i); }}
                />
                <Input
                  className="h-10 text-sm"
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder={suggestedLoad != null ? String(suggestedLoad) : "—"}
                  value={row.load}
                  onChange={(e) => updateRow(i, "load", e.target.value)}
                  onBlur={() => { if (row.touched) saveSet(i); }}
                />
                <Input
                  className="h-10 text-sm"
                  type="number"
                  min={0}
                  max={10}
                  placeholder="—"
                  value={row.rpe}
                  onChange={(e) => updateRow(i, "rpe", e.target.value)}
                  onBlur={() => { if (row.touched) saveSet(i); }}
                />
                {exercise.previousSession && (
                  <span className="text-xs text-primary font-medium whitespace-nowrap px-1">
                    {prevLabel ?? "—"}
                  </span>
                )}
                <button
                  onClick={() => saveSet(i)}
                  className={`flex items-center justify-center h-10 w-9 rounded-md transition-colors ${
                    row.saved
                      ? "text-green-500 bg-green-500/10 hover:bg-green-500/15"
                      : "text-muted-foreground hover:text-green-500 hover:bg-muted"
                  }`}
                  title="Mark saved"
                >
                  {row.saved ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </button>
              </div>
            );
          })}

          {exercise.previousSession && (
            <p className="text-[10px] text-muted-foreground pt-1">
              Last session: {new Date(exercise.previousSession.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          )}
        </div>
      </CardContent>
      )}
    </Card>
  );
}

function RPEPrompt({
  workoutId,
  athleteId,
  onDone,
  onSaveAttendance,
}: {
  workoutId: string;
  athleteId: string;
  onDone: () => void;
  onSaveAttendance?: (params: { workoutId: string; athleteId: string; rpePost: number }) => Promise<void>;
}) {
  const supabase = createClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit() {
    if (selected == null) return;
    setSaving(true);
    try {
      if (onSaveAttendance) {
        await onSaveAttendance({ workoutId, athleteId, rpePost: selected });
      } else {
        await supabase
          .from("attendance")
          .upsert(
            { workout_id: workoutId, athlete_id: athleteId, rpe_post: selected },
            { onConflict: "workout_id,athlete_id" }
          );
      }
    } finally {
      setSaving(false);
    }
    setSaved(true);
    setTimeout(onDone, 1200);
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <CheckCircle2 className="w-12 h-12 text-green-500" />
        <p className="text-lg font-semibold">Great work today!</p>
        <p className="text-sm text-muted-foreground">Post-workout RPE saved.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">How hard was that?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Rate the overall difficulty of your workout (0 = no exertion, 10 = maximum effort).
        </p>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {RPE_OPTIONS.map((n) => (
          <button
            key={n}
            onClick={() => setSelected(n)}
            className={`rounded-lg border-2 py-3 text-center transition-all ${
              selected === n
                ? "border-primary bg-primary text-primary-foreground font-bold"
                : "border-input hover:border-primary/50"
            }`}
          >
            <div className="text-xl font-bold">{n}</div>
          </button>
        ))}
      </div>

      {selected != null && (
        <p className="text-sm text-center text-muted-foreground">
          RPE {selected} — {RPE_LABELS[selected]}
        </p>
      )}

      <Button
        className="w-full"
        disabled={selected == null || saving}
        onClick={submit}
      >
        {saving ? "Saving…" : "Save & Finish"}
      </Button>
    </div>
  );
}

type SaveSetFn = (params: {
  workoutExerciseId: string;
  athleteId: string;
  workoutId: string;
  setNumber: number;
  repsCompleted: number | null;
  loadCompleted: number | null;
  rpe: number | null;
  existingLogId?: string | null;
}) => Promise<{ id: string } | null>;

export function WorkoutLogger({
  workout,
  exercises,
  athleteId,
  attendanceId,
  onSaveSet,
  onSaveAttendance,
  dGroupOptional = true,
}: {
  workout: Workout;
  exercises: Exercise[];
  athleteId: string;
  attendanceId?: string | null;
  onSaveSet?: SaveSetFn;
  onSaveAttendance?: (params: { workoutId: string; athleteId: string; rpePost: number }) => Promise<void>;
  dGroupOptional?: boolean;
}) {
  const [showRPEPrompt, setShowRPEPrompt] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});

  const handleProgress = useCallback((exerciseId: string, completed: number) => {
    setProgressMap((prev) => (prev[exerciseId] === completed ? prev : { ...prev, [exerciseId]: completed }));
  }, []);

  const preActivationExercises = exercises.filter((e) => e.is_pre_activation);
  const mainExercises = exercises.filter((e) => !e.is_pre_activation);
  const hasPreActivation = preActivationExercises.length > 0;
  const totalSets = mainExercises.reduce((sum, e) => sum + (e.override?.sets ?? e.sets ?? 1), 0);
  const completedSets = mainExercises.reduce((sum, e) => sum + (progressMap[e.id] ?? 0), 0);
  const progressPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{workout.title}</h1>
          <div className="flex items-center gap-1 shrink-0">
            {workout.prevWorkoutId ? (
              <Link href={`/athlete/workout/${workout.prevWorkoutId}`}>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Previous workout">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-30" disabled>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {workout.nextWorkoutId ? (
              <Link href={`/athlete/workout/${workout.nextWorkoutId}`}>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Next workout">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-30" disabled>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {new Date(workout.date + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        {workout.notes && <p className="text-sm mt-1">{workout.notes}</p>}
      </div>

      {!showRPEPrompt && totalSets > 0 && (
        <div className="sticky top-14 z-10 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-muted-foreground">
              {mainExercises.length} exercise{mainExercises.length !== 1 ? "s" : ""}
              {hasPreActivation && ` · ${preActivationExercises.length} activation`}
            </span>
            <span className={`font-semibold ${progressPct === 100 ? "text-green-600 dark:text-green-400" : "text-foreground"}`}>
              {completedSets}/{totalSets} sets
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressPct === 100 ? "bg-green-500" : "bg-primary"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Always keep ExerciseCards mounted to preserve set state */}
      <div className={showRPEPrompt ? "hidden" : ""}>
        {exercises.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No exercises in this workout.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {hasPreActivation && (
              <>
                {/* Pre-Activation section */}
                <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/20">
                  <Zap className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Pre-Activation</p>
                    <p className="text-xs text-amber-700/70 dark:text-amber-500">Complete before training</p>
                  </div>
                </div>
                {preActivationExercises.map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    athleteId={athleteId}
                    workoutId={workout.id}
                    workoutDate={workout.date}
                    onSaveSet={onSaveSet}
                  />
                ))}
                {/* Divider before main lift */}
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-1.5 rounded-full bg-amber-400" />
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="flex items-center gap-2 text-lg font-bold text-amber-700 dark:text-amber-400">
                      <Dumbbell className="h-5 w-5" />
                      <span>{workout.title}</span>
                    </div>
                    <span className="text-sm text-amber-600/70 dark:text-amber-500">(post training)</span>
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-amber-400" />
                </div>
              </>
            )}
            {mainExercises.map((ex, i) => (
              <Fragment key={ex.id}>
                {dGroupOptional && startsOptionalBlock(ex.superset_group, mainExercises[i - 1]?.superset_group ?? null) && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Optional</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <ExerciseCard
                  exercise={ex}
                  athleteId={athleteId}
                  workoutId={workout.id}
                  workoutDate={workout.date}
                  onSaveSet={onSaveSet}
                  onProgress={handleProgress}
                />
              </Fragment>
            ))}
          </div>
        )}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => setShowRPEPrompt(true)}
        >
          <Flag className="w-4 h-4" />
          Finish Workout
        </Button>
      </div>

      {showRPEPrompt && (
        <Card>
          <CardContent className="pt-6">
            <RPEPrompt
              workoutId={workout.id}
              athleteId={athleteId}
              onDone={() => setShowRPEPrompt(false)}
              onSaveAttendance={onSaveAttendance}
            />
          </CardContent>
        </Card>
      )}

      <div className="pb-8" />
    </div>
  );
}
