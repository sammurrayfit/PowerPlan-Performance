import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkoutLogger } from "@/components/athlete/workout-logger";

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
      .select("*, exercises(id, name)")
      .eq("workout_id", id)
      .order("sort_order"),
  ]);

  if (!workout) notFound();

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

  // Latest max per exercise
  const maxesMap: Record<string, number> = {};
  for (const m of maxesRaw ?? []) {
    if (!maxesMap[m.exercise_id]) maxesMap[m.exercise_id] = Number(m.value);
  }

  // Overrides by workout_exercise_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overridesMap: Record<string, any> = {};
  for (const o of overridesRaw ?? []) overridesMap[o.workout_exercise_id] = o;

  // Logs grouped by workout_exercise_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logsMap: Record<string, any[]> = {};
  for (const l of logsRaw ?? []) {
    if (!logsMap[l.workout_exercise_id]) logsMap[l.workout_exercise_id] = [];
    logsMap[l.workout_exercise_id].push(l);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exerciseList = exercises.map((e: any) => ({
    id: e.id,
    exercise_id: e.exercise_id,
    exercise_name: (e.exercises as { name: string })?.name ?? "Unknown",
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

  return (
    <WorkoutLogger
      workout={workout}
      exercises={exerciseList}
      athleteId={user.id}
    />
  );
}
