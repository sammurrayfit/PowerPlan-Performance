"use server";

import { createClient } from "@/lib/supabase/server";

// ── Single-athlete (used by athlete self-log) ─────────────────────────────────
export async function fetchAthleteWorkoutData(workoutId: string, athleteId: string) {
  const supabase = await createClient();

  const [{ data: rawExercises }, { data: logsRaw }] = await Promise.all([
    supabase
      .from("workout_exercises")
      .select("*, exercises(id, name, video_url, image_url)")
      .eq("workout_id", workoutId)
      .order("sort_order"),
    supabase
      .from("exercise_logs")
      .select("*")
      .eq("workout_id", workoutId)
      .eq("athlete_id", athleteId),
  ]);

  const exercises = rawExercises ?? [];
  const weIds = exercises.map((e) => e.id);
  const baseExerciseIds: string[] = exercises.map((e) => e.exercise_id).filter(Boolean);

  const [{ data: overridesRaw }, { data: maxesRaw }] = await Promise.all([
    weIds.length > 0
      ? supabase
          .from("athlete_exercise_overrides")
          .select("*")
          .in("workout_exercise_id", weIds)
          .eq("athlete_id", athleteId)
      : Promise.resolve({ data: [] }),
    baseExerciseIds.length > 0
      ? supabase
          .from("maxes")
          .select("exercise_id, value")
          .eq("athlete_id", athleteId)
          .in("exercise_id", baseExerciseIds)
          .order("date_recorded", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const maxesMap: Record<string, number> = {};
  for (const m of maxesRaw ?? []) {
    if (!maxesMap[m.exercise_id]) maxesMap[m.exercise_id] = Number(m.value);
  }

  const overridesMap: Record<string, object> = {};
  for (const o of overridesRaw ?? []) overridesMap[(o as { workout_exercise_id: string }).workout_exercise_id] = o;

  const logsMap: Record<string, object[]> = {};
  for (const l of logsRaw ?? []) {
    const key = (l as { workout_exercise_id: string }).workout_exercise_id;
    if (!logsMap[key]) logsMap[key] = [];
    logsMap[key].push(l);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return exercises.map((e: any) => ({
    id: e.id,
    exercise_id: e.exercise_id,
    exercise_name: (e.exercises as { name: string } | null)?.name ?? "Unknown",
    video_url: (e.exercises as { video_url: string | null } | null)?.video_url ?? null,
    image_url: (e.exercises as { image_url: string | null } | null)?.image_url ?? null,
    sort_order: e.sort_order,
    sets: e.sets,
    reps: e.reps,
    load: e.load,
    load_type: e.load_type,
    tempo: e.tempo,
    rest_seconds: e.rest_seconds,
    notes: e.notes,
    superset_group: e.superset_group ?? null,
    override: overridesMap[e.id] ?? null,
    max: e.exercise_id ? (maxesMap[e.exercise_id] ?? null) : null,
    logs: logsMap[e.id] ?? [],
  }));
}

// ── Multi-athlete (coach monitoring panel) ────────────────────────────────────
export type AthleteExercise = {
  id: string;
  exercise_name: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  load_type: string;
  setsCompleted: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logs: any[];
};

export type AthletePanel = {
  athleteId: string;
  lastActiveAt: string | null;
  rpe_pre: number | null;
  rpe_post: number | null;
  exercises: AthleteExercise[];
};

export async function fetchMultiAthleteData(
  workoutId: string,
  athleteIds: string[]
): Promise<AthletePanel[]> {
  if (athleteIds.length === 0) return [];

  const supabase = await createClient();

  // Fetch workout exercises once
  const { data: rawExercises } = await supabase
    .from("workout_exercises")
    .select("*, exercises(id, name, video_url, image_url)")
    .eq("workout_id", workoutId)
    .order("sort_order");

  const exercises = rawExercises ?? [];
  const weIds = exercises.map((e) => e.id);
  const baseExerciseIds = [
    ...new Set(exercises.map((e: { exercise_id: string }) => e.exercise_id).filter(Boolean)),
  ];

  // Batch all athlete data in 4 parallel queries
  const [{ data: allLogs }, { data: allOverrides }, { data: allMaxes }, { data: allAttendance }] = await Promise.all([
    weIds.length > 0
      ? supabase
          .from("exercise_logs")
          .select("*")
          .eq("workout_id", workoutId)
          .in("athlete_id", athleteIds)
      : Promise.resolve({ data: [] }),
    weIds.length > 0
      ? supabase
          .from("athlete_exercise_overrides")
          .select("*")
          .in("workout_exercise_id", weIds)
          .in("athlete_id", athleteIds)
      : Promise.resolve({ data: [] }),
    baseExerciseIds.length > 0
      ? supabase
          .from("maxes")
          .select("athlete_id, exercise_id, value")
          .in("athlete_id", athleteIds)
          .in("exercise_id", baseExerciseIds as string[])
          .order("date_recorded", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("attendance")
      .select("athlete_id, rpe_pre, rpe_post")
      .eq("workout_id", workoutId)
      .in("athlete_id", athleteIds),
  ]);

  // Build attendance lookup by athleteId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attendanceMap: Record<string, { rpe_pre: number | null; rpe_post: number | null }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of allAttendance ?? [] as any[]) {
    attendanceMap[a.athlete_id] = { rpe_pre: a.rpe_pre ?? null, rpe_post: a.rpe_post ?? null };
  }

  return athleteIds.map((athleteId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const athleteLogs = (allLogs ?? []).filter((l: any) => l.athlete_id === athleteId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const athleteOverrides = (allOverrides ?? []).filter((o: any) => o.athlete_id === athleteId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const athleteMaxes = (allMaxes ?? []).filter((m: any) => m.athlete_id === athleteId);

    const maxesMap: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of athleteMaxes as any[]) {
      if (!maxesMap[m.exercise_id]) maxesMap[m.exercise_id] = Number(m.value);
    }

    const overridesMap: Record<string, { sets?: number | null; reps?: string | null; load?: number | null }> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const o of athleteOverrides as any[]) overridesMap[o.workout_exercise_id] = o;

    const logsMap: Record<string, object[]> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of athleteLogs as any[]) {
      if (!logsMap[l.workout_exercise_id]) logsMap[l.workout_exercise_id] = [];
      logsMap[l.workout_exercise_id].push(l);
    }

    // Most recent log timestamp
    const lastActiveAt =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      athleteLogs.length > 0
        ? (athleteLogs as any[]).reduce(
            (latest: string, l: any) => (l.logged_at > latest ? l.logged_at : latest),
            (athleteLogs as any[])[0].logged_at
          )
        : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const athleteExercises: AthleteExercise[] = exercises.map((e: any) => {
      const override = overridesMap[e.id];
      const sets = override?.sets ?? e.sets ?? null;
      const reps = override?.reps ?? e.reps ?? null;
      const load = override?.load ?? e.load ?? null;
      const logs = logsMap[e.id] ?? [];
      return {
        id: e.id,
        exercise_name: (e.exercises as { name: string } | null)?.name ?? "Unknown",
        sets,
        reps,
        load,
        load_type: e.load_type ?? "absolute",
        setsCompleted: logs.length,
        logs,
      };
    });

    const att = attendanceMap[athleteId] ?? { rpe_pre: null, rpe_post: null };
    return { athleteId, lastActiveAt, rpe_pre: att.rpe_pre, rpe_post: att.rpe_post, exercises: athleteExercises };
  });
}
