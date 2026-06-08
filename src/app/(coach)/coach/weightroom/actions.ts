"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── Save a set log on behalf of an athlete (coach-authenticated, bypasses RLS) ─
export async function saveKioskSet(params: {
  workoutExerciseId: string;
  athleteId: string;
  workoutId: string;
  setNumber: number;
  repsCompleted: number | null;
  loadCompleted: number | null;
  rpe: number | null;
  existingLogId?: string | null;
}): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Verify this coach owns the workout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: wo } = await supabase
    .from("workouts")
    .select("calendars(coach_id)")
    .eq("id", params.workoutId)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((wo as any)?.calendars?.coach_id !== user.id) throw new Error("Not authorized");

  const admin = adminClient();
  if (params.existingLogId) {
    const { error } = await admin
      .from("exercise_logs")
      .update({
        reps_completed: params.repsCompleted,
        load_completed: params.loadCompleted,
        rpe: params.rpe,
      })
      .eq("id", params.existingLogId);
    if (error) throw new Error(error.message);
    return { id: params.existingLogId };
  } else {
    const { data, error } = await admin
      .from("exercise_logs")
      .insert({
        workout_exercise_id: params.workoutExerciseId,
        athlete_id: params.athleteId,
        workout_id: params.workoutId,
        set_number: params.setNumber,
        reps_completed: params.repsCompleted,
        load_completed: params.loadCompleted,
        rpe: params.rpe,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}

export type PreviousSet = {
  set_number: number;
  reps: number | null;
  load: number | null;
  rpe: number | null;
};

export type PreviousSession = {
  date: string;
  sets: PreviousSet[];
};

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

  const [{ data: overridesRaw }, { data: maxesRaw }, { data: prevWEs }] = await Promise.all([
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
    // Previous workout_exercises for the same exercises (different workout)
    baseExerciseIds.length > 0
      ? supabase
          .from("workout_exercises")
          .select("id, exercise_id, workout_id, workouts(date)")
          .in("exercise_id", baseExerciseIds)
          .neq("workout_id", workoutId)
      : Promise.resolve({ data: [] }),
  ]);

  // For each exercise_id, find the most recent previous workout_exercise
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestWeByExId: Record<string, { weId: string; date: string }> = {};
  for (const we of prevWEs ?? [] as any[]) {
    const exId = we.exercise_id as string;
    const date = (we.workouts as { date: string } | null)?.date ?? "";
    if (!date) continue;
    if (!latestWeByExId[exId] || date > latestWeByExId[exId].date) {
      latestWeByExId[exId] = { weId: we.id, date };
    }
  }

  const prevWeIds = Object.values(latestWeByExId).map((v) => v.weId);
  const { data: prevLogsRaw } = prevWeIds.length > 0
    ? await supabase
        .from("exercise_logs")
        .select("workout_exercise_id, set_number, reps_completed, load_completed, rpe")
        .eq("athlete_id", athleteId)
        .in("workout_exercise_id", prevWeIds)
        .order("set_number")
    : { data: [] };

  // Build previousSession map keyed by workout_exercise_id → exercise_id → session
  const prevWeIdToExId: Record<string, string> = {};
  for (const [exId, { weId }] of Object.entries(latestWeByExId)) {
    prevWeIdToExId[weId] = exId;
  }

  const prevSessionByExId: Record<string, PreviousSession> = {};
  for (const l of prevLogsRaw ?? [] as any[]) {
    const exId = prevWeIdToExId[l.workout_exercise_id];
    if (!exId) continue;
    if (!prevSessionByExId[exId]) {
      prevSessionByExId[exId] = { date: latestWeByExId[exId].date, sets: [] };
    }
    prevSessionByExId[exId].sets.push({
      set_number: l.set_number,
      reps: l.reps_completed ?? null,
      load: l.load_completed ?? null,
      rpe: l.rpe ?? null,
    });
  }

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
    previousSession: e.exercise_id ? (prevSessionByExId[e.exercise_id] ?? null) : null,
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
