"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle } from "lucide-react";

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

interface Exercise {
  id: string;
  exercise_id: string;
  exercise_name: string;
  sort_order: number;
  sets: number | null;
  reps: string | null;
  load: number | null;
  load_type: string | null;
  tempo: string | null;
  rest_seconds: number | null;
  notes: string | null;
  superset_group: string | null;
  override: Override | null;
  max: number | null;
  logs: ExerciseLog[];
}

interface Workout {
  id: string;
  title: string;
  date: string;
  notes: string | null;
  is_locked: boolean;
}

interface SetRow {
  reps: string;
  load: string;
  rpe: string;
  saved: boolean;
  logId: string | null;
}

function calcWeight(load: number | null, loadType: string | null, max: number | null): number | null {
  if (load == null || loadType !== "percent_1rm" || max == null) return null;
  return Math.round((load / 100) * max);
}

function supersetColor(group: string): string {
  const idx = group.toUpperCase().charCodeAt(0) - 65;
  return `hsl(${idx * 37 + 200}, 70%, 50%)`;
}

function ExerciseCard({
  exercise,
  athleteId,
  workoutId,
}: {
  exercise: Exercise;
  athleteId: string;
  workoutId: string;
}) {
  const supabase = createClient();

  const effectiveSets = exercise.override?.sets ?? exercise.sets ?? 1;
  const effectiveReps = exercise.override?.reps ?? exercise.reps ?? "";
  const effectiveLoad = exercise.override?.load ?? exercise.load;
  const effectiveLoadType = exercise.override?.load_type ?? exercise.load_type;
  const calcLbs = calcWeight(effectiveLoad, effectiveLoadType, exercise.max);

  const buildInitialRows = useCallback((): SetRow[] => {
    return Array.from({ length: effectiveSets }, (_, i) => {
      const existing = exercise.logs.find((l) => l.set_number === i + 1);
      return {
        reps: existing?.reps_completed != null ? String(existing.reps_completed) : "",
        load: existing?.load_completed != null ? String(existing.load_completed) : calcLbs != null ? String(calcLbs) : "",
        rpe: existing?.rpe != null ? String(existing.rpe) : "",
        saved: !!existing,
        logId: existing?.id ?? null,
      };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = useState<SetRow[]>(buildInitialRows);

  function updateRow(index: number, field: keyof Pick<SetRow, "reps" | "load" | "rpe">, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value, saved: false };
      return next;
    });
  }

  async function saveSet(index: number) {
    const row = rows[index];
    const repsNum = row.reps !== "" ? parseInt(row.reps, 10) : null;
    const loadNum = row.load !== "" ? parseFloat(row.load) : null;
    const rpeNum = row.rpe !== "" ? parseInt(row.rpe, 10) : null;

    if (row.logId) {
      await supabase
        .from("exercise_logs")
        .update({ reps_completed: repsNum, load_completed: loadNum, rpe: rpeNum })
        .eq("id", row.logId);
      setRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], saved: true };
        return next;
      });
    } else {
      const { data } = await supabase
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
      setRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], saved: true, logId: data?.id ?? null };
        return next;
      });
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

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {exercise.superset_group && (
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
          <span className="text-xs text-muted-foreground shrink-0">
            {completedCount}/{effectiveSets} sets
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mt-1">
          {effectiveReps && <Badge variant="outline">{effectiveReps} reps</Badge>}
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
      </CardHeader>

      <CardContent className="px-4 pb-4">
        <div className="space-y-2">
          <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-1 text-xs text-muted-foreground px-1">
            <span>Set</span>
            <span>Reps</span>
            <span>Load (lbs)</span>
            <span>RPE</span>
            <span />
          </div>

          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-1 items-center">
              <span className="text-sm text-muted-foreground text-center">{i + 1}</span>
              <Input
                className="h-8 text-sm"
                type="number"
                min={0}
                placeholder={effectiveReps || "—"}
                value={row.reps}
                onChange={(e) => updateRow(i, "reps", e.target.value)}
                onBlur={() => { if (row.reps || row.load) saveSet(i); }}
              />
              <Input
                className="h-8 text-sm"
                type="number"
                min={0}
                step={0.5}
                placeholder={calcLbs != null ? String(calcLbs) : "—"}
                value={row.load}
                onChange={(e) => updateRow(i, "load", e.target.value)}
                onBlur={() => { if (row.reps || row.load) saveSet(i); }}
              />
              <Input
                className="h-8 text-sm"
                type="number"
                min={1}
                max={10}
                placeholder="—"
                value={row.rpe}
                onChange={(e) => updateRow(i, "rpe", e.target.value)}
                onBlur={() => { if (row.reps || row.load) saveSet(i); }}
              />
              <button
                onClick={() => saveSet(i)}
                className="flex items-center justify-center text-muted-foreground hover:text-green-500 transition-colors"
                title="Mark saved"
              >
                {row.saved ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkoutLogger({
  workout,
  exercises,
  athleteId,
}: {
  workout: Workout;
  exercises: Exercise[];
  athleteId: string;
}) {
  const totalSets = exercises.reduce((sum, e) => sum + (e.override?.sets ?? e.sets ?? 1), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{workout.title}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(workout.date + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        {workout.notes && <p className="text-sm mt-1">{workout.notes}</p>}
        <p className="text-xs text-muted-foreground mt-1">
          {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} · {totalSets} total sets
        </p>
      </div>

      {exercises.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No exercises in this workout.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {exercises.map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              athleteId={athleteId}
              workoutId={workout.id}
            />
          ))}
        </div>
      )}

      <div className="pb-8" />
    </div>
  );
}
