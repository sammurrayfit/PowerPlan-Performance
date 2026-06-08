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

  // Check attendance (for RPE gate + post-RPE)
  const { data: attendance, error: attendanceError } = await supabase
    .from("attendance")
    .select("id, rpe_pre, rpe_post")
    .eq("workout_id", id)
    .eq("athlete_id", user.id)
    .maybeSingle();

  // On DB error, fail safe: block access rather than silently bypassing the gate
  if (attendanceError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-2 text-center">
        <p className="font-medium">Unable to load workout</p>
        <p className="text-sm text-muted-foreground">Please refresh the page and try again.</p>
      </div>
    );
  }

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

  const exerciseList = exercises.map((e: any) => ({
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

  return (
    <WorkoutLogger
      workout={workout}
      exercises={exerciseList}
      athleteId={user.id}
      attendanceId={attendance?.id ?? null}
    />
  );
}
