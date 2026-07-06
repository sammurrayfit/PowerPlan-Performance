import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkoutLogger } from "@/components/athlete/workout-logger";
import { RPEGate } from "@/components/athlete/rpe-gate";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AthleteWorkoutPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: workout }, { data: rawExercises }] = await Promise.all([
    supabase.from("workouts").select("id, title, date, notes, is_locked, calendar_id").eq("id", id).single(),
    supabase
      .from("workout_exercises")
      .select("*, exercises(id, name, video_url, image_url)")
      .eq("workout_id", id)
      .order("sort_order"),
  ]);

  if (!workout) notFound();

  // Fetch pre-activation workout from athlete's personal calendar for this date
  const { data: personalCalendars } = await supabase
    .from("calendars")
    .select("id")
    .eq("athlete_id", user.id)
    .eq("name", "Pre-Activation");

  const personalCalIds = (personalCalendars ?? []).map((c) => c.id);

  const preActivationExerciseList: {
    id: string; exercise_id: string; exercise_name: string;
    video_url: string | null; image_url: string | null;
    sort_order: number; sets: number | null; reps: string | null;
    load: number | null; load_type: string | null; tempo: string | null;
    rest_seconds: number | null; notes: string | null; superset_group: string | null;
    is_pre_activation: boolean; override: null; max: null; logs: object[]; previousSession: null;
  }[] = [];

  if (personalCalIds.length > 0) {
    const { data: preActWorkout } = await supabase
      .from("workouts")
      .select("id")
      .in("calendar_id", personalCalIds)
      .eq("date", workout.date)
      .eq("title", "Pre-Activation")
      .maybeSingle();

    if (preActWorkout) {
      const [{ data: preActExercises }, { data: preActLogs }] = await Promise.all([
        supabase
          .from("workout_exercises")
          .select("*, exercises(id, name, video_url, image_url)")
          .eq("workout_id", preActWorkout.id)
          .order("sort_order"),
        supabase
          .from("exercise_logs")
          .select("*")
          .eq("workout_id", preActWorkout.id)
          .eq("athlete_id", user.id),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const preActLogsMap: Record<string, any[]> = {};
      for (const l of preActLogs ?? []) {
        if (!preActLogsMap[l.workout_exercise_id]) preActLogsMap[l.workout_exercise_id] = [];
        preActLogsMap[l.workout_exercise_id].push(l);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const e of preActExercises ?? [] as any[]) {
        preActivationExerciseList.push({
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
          is_pre_activation: true,
          override: null,
          max: null,
          logs: preActLogsMap[e.id] ?? [],
          previousSession: null,
        });
      }
    }
  }

  // Fetch sibling workouts for prev/next navigation
  const { data: siblingWorkouts } = await supabase
    .from("workouts")
    .select("id, date")
    .eq("calendar_id", workout.calendar_id)
    .order("date");

  const workoutList = siblingWorkouts ?? [];
  const currentIdx = workoutList.findIndex((w) => w.id === id);
  const prevWorkoutId = currentIdx > 0 ? workoutList[currentIdx - 1].id : null;
  const nextWorkoutId = currentIdx < workoutList.length - 1 ? workoutList[currentIdx + 1].id : null;

  // Check attendance (for RPE gate + post-RPE)
  const { data: attendance, error: attendanceError } = await supabase
    .from("attendance")
    .select("id, rpe_pre, rpe_post")
    .eq("workout_id", id)
    .eq("athlete_id", user.id)
    .maybeSingle();

  // Treat attendance query errors (e.g. RLS on team calendars) as "no attendance yet" —
  // the RPE gate handles the locked-but-no-attendance case below.

  const needsRPEGate = workout.is_locked && (attendance == null || attendance.rpe_pre == null);

  if (needsRPEGate) {
    return (
      <RPEGate
        workoutId={id}
        workoutTitle={workout.title}
        workoutDate={workout.date}
        athleteId={user.id}
      />
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exercises = (rawExercises ?? []) as any[];
  const weIds = exercises.map((e) => e.id);
  const exerciseBaseIds: string[] = exercises.map((e) => e.exercise_id).filter(Boolean);

  const [{ data: overridesRaw }, { data: maxesRaw }, { data: logsRaw }] = await Promise.all([
    weIds.length > 0
      ? supabase.from("athlete_exercise_overrides").select("*").in("workout_exercise_id", weIds).eq("athlete_id", user.id)
      : Promise.resolve({ data: [] }),
    exerciseBaseIds.length > 0
      ? supabase
          .from("maxes")
          .select("exercise_id, value")
          .eq("athlete_id", user.id)
          .in("exercise_id", exerciseBaseIds)
          .order("date_recorded", { ascending: false })
      : Promise.resolve({ data: [] }),
    weIds.length > 0
      ? supabase.from("exercise_logs").select("*").eq("workout_id", id).eq("athlete_id", user.id)
      : Promise.resolve({ data: [] }),
  ]);

  const maxesMap: Record<string, number> = {};
  for (const m of maxesRaw ?? []) {
    if (!maxesMap[m.exercise_id]) maxesMap[m.exercise_id] = Number(m.value);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overridesMap: Record<string, any> = {};
  for (const o of overridesRaw ?? []) overridesMap[o.workout_exercise_id] = o;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logsMap: Record<string, any[]> = {};
  for (const l of logsRaw ?? []) {
    if (!logsMap[l.workout_exercise_id]) logsMap[l.workout_exercise_id] = [];
    logsMap[l.workout_exercise_id].push(l);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Fetch previous session data for each exercise
  const { data: prevWEs } = exerciseBaseIds.length > 0
    ? await supabase
        .from("workout_exercises")
        .select("id, exercise_id, workout_id, workouts(date)")
        .in("exercise_id", exerciseBaseIds)
        .neq("workout_id", id)
    : { data: [] };

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
  const prevWeIdToExId: Record<string, string> = {};
  for (const [exId, { weId }] of Object.entries(latestWeByExId)) prevWeIdToExId[weId] = exId;

  const { data: prevLogsRaw } = prevWeIds.length > 0
    ? await supabase
        .from("exercise_logs")
        .select("workout_exercise_id, set_number, reps_completed, load_completed, rpe")
        .eq("athlete_id", user.id)
        .in("workout_exercise_id", prevWeIds)
        .order("set_number")
    : { data: [] };

  const prevSessionByExId: Record<string, { date: string; sets: { set_number: number; reps: number | null; load: number | null; rpe: number | null }[] }> = {};
  for (const l of prevLogsRaw ?? [] as any[]) {
    const exId = prevWeIdToExId[l.workout_exercise_id];
    if (!exId) continue;
    if (!prevSessionByExId[exId]) prevSessionByExId[exId] = { date: latestWeByExId[exId].date, sets: [] };
    prevSessionByExId[exId].sets.push({ set_number: l.set_number, reps: l.reps_completed ?? null, load: l.load_completed ?? null, rpe: l.rpe ?? null });
  }

  // If the athlete has personalized overrides for this workout, show only those exercises.
  // This handles programs where different athletes have different exercise lists
  // (not just different loads). Athletes with no overrides see the full base.
  const hasOverrides = Object.keys(overridesMap).length > 0;
  const visibleExercises = hasOverrides
    ? exercises.filter((e: any) => overridesMap[e.id])
    : exercises;

  const exerciseList = visibleExercises.map((e: any) => ({
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
    is_pre_activation: e.is_pre_activation ?? false,
    override: overridesMap[e.id] ?? null,
    max: e.exercise_id ? (maxesMap[e.exercise_id] ?? null) : null,
    logs: logsMap[e.id] ?? [],
    previousSession: e.exercise_id ? (prevSessionByExId[e.exercise_id] ?? null) : null,
  }));

  // Pre-activation prepended; main exercises follow
  const combinedExercises = [...preActivationExerciseList, ...exerciseList];

  return (
    <WorkoutLogger
      workout={{ ...workout, prevWorkoutId, nextWorkoutId }}
      exercises={combinedExercises}
      athleteId={user.id}
      attendanceId={attendance?.id ?? null}
    />
  );
}
