import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkoutBuilder } from "@/components/coach/calendar/workout-builder";
import { AttendancePanel } from "@/components/coach/calendar/attendance-panel";
import { LoggedDetailPanel } from "@/components/coach/calendar/logged-detail-panel";

interface Props {
  params: Promise<{ id: string; wid: string }>;
  searchParams: Promise<{ athlete?: string; back?: string }>;
}

export default async function WorkoutPage({ params, searchParams }: Props) {
  const { id, wid } = await params;
  const { athlete: athleteFilter, back: backUrl } = await searchParams;
  const supabase = await createClient();

  const [{ data: workout }, { data: rawExercises }, { data: allExercises }, { data: calendar }, { data: siblingWorkouts }] = await Promise.all([
    supabase.from("workouts").select("*").eq("id", wid).single(),
    supabase
      .from("workout_exercises")
      .select("*, exercises(id, name, muscle_groups, category_id)")
      .eq("workout_id", wid)
      .order("sort_order"),
    supabase.from("exercises").select("id, name, category_id, muscle_groups").order("name"),
    supabase.from("calendars").select("team_id").eq("id", id).single(),
    supabase.from("workouts").select("id, date").eq("calendar_id", id).order("date"),
  ]);

  if (!workout || workout.calendar_id !== id) notFound();

  const workoutList = siblingWorkouts ?? [];
  const currentIdx = workoutList.findIndex((w) => w.id === wid);
  const prevWorkoutId = currentIdx > 0 ? workoutList[currentIdx - 1].id : null;
  const nextWorkoutId = currentIdx < workoutList.length - 1 ? workoutList[currentIdx + 1].id : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exercises = (rawExercises ?? []).map((e: any) => ({
    ...e,
    exercise_name: (e.exercises as { name: string } | null)?.name ?? "",
  }));

  // If navigating from an athlete's profile, filter to only their exercises
  if (athleteFilter) {
    const { data: athleteOverrides } = await supabase
      .from("athlete_exercise_overrides")
      .select("workout_exercise_id, sets, reps, load, notes")
      .eq("athlete_id", athleteFilter)
      .in("workout_exercise_id", exercises.map((e) => e.id));

    if (athleteOverrides && athleteOverrides.length > 0) {
      // Keep only exercises where the athlete has a non-skip override (sets or reps set)
      const overrideByWeId = new Map(athleteOverrides.map((o) => [o.workout_exercise_id, o]));
      const activeWeIds = new Set(
        athleteOverrides
          .filter((o) => o.sets != null || o.reps != null)
          .map((o) => o.workout_exercise_id)
      );
      exercises = exercises
        .filter((e) => activeWeIds.has(e.id))
        .map((e) => ({ ...e, notes: overrideByWeId.get(e.id)?.notes ?? e.notes }));
    }
  }

  const exerciseIds = exercises.map((e) => e.id);
  const baseExerciseIds: string[] = exercises.map((e) => e.exercise_id).filter(Boolean);

  let athletes: { id: string; full_name: string }[] = [];
  let initialOverrides: object[] = [];
  let maxesMap: Record<string, Record<string, number>> = {};

  if (calendar?.team_id) {
    const { data: memberships } = await supabase
      .from("team_memberships")
      .select("athlete_id")
      .eq("team_id", calendar.team_id);

    const athleteIds = (memberships ?? []).map((m) => m.athlete_id);

    if (athleteIds.length > 0) {
      const [{ data: profiles }, { data: overrides }, { data: maxesRaw }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", athleteIds)
          .order("full_name"),
        exerciseIds.length > 0
          ? supabase
              .from("athlete_exercise_overrides")
              .select("*")
              .in("workout_exercise_id", exerciseIds)
          : Promise.resolve({ data: [] }),
        baseExerciseIds.length > 0
          ? supabase
              .from("maxes")
              .select("athlete_id, exercise_id, value, date_recorded")
              .in("athlete_id", athleteIds)
              .in("exercise_id", baseExerciseIds)
              .order("date_recorded", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

      athletes = profiles ?? [];
      initialOverrides = overrides ?? [];

      // Build maxesMap: athleteId -> exerciseId -> latest max value
      for (const m of maxesRaw ?? []) {
        if (!maxesMap[m.athlete_id]) maxesMap[m.athlete_id] = {};
        if (!maxesMap[m.athlete_id][m.exercise_id]) {
          maxesMap[m.athlete_id][m.exercise_id] = Number(m.value);
        }
      }
    }
  }

  // Fetch existing attendance records and logged sets for this workout
  const athleteIds = athletes.map((a) => a.id);
  const [{ data: attendanceRaw }, { data: workoutLogsRaw }] = athleteIds.length > 0
    ? await Promise.all([
        supabase
          .from("attendance")
          .select("athlete_id, status, rpe_pre, rpe_post")
          .eq("workout_id", wid)
          .in("athlete_id", athleteIds),
        supabase
          .from("exercise_logs")
          .select("workout_exercise_id, athlete_id, set_number, reps_completed, load_completed, rpe")
          .eq("workout_id", wid)
          .in("athlete_id", athleteIds)
          .order("set_number"),
      ])
    : [{ data: [] }, { data: [] }];

  const attendanceByAthlete = Object.fromEntries(
    (attendanceRaw ?? []).map((a) => [a.athlete_id, a])
  );

  const initialAttendance = athletes.map((a) => ({
    athleteId: a.id,
    athleteName: a.full_name,
    status: (attendanceByAthlete[a.id]?.status ?? null) as "present" | "late" | "absent" | null,
    rpe_pre: attendanceByAthlete[a.id]?.rpe_pre ?? null,
    rpe_post: attendanceByAthlete[a.id]?.rpe_post ?? null,
  }));

  // Build athleteId -> workoutExerciseId -> logged sets, for the coach-facing detail view
  const logsByAthleteExercise: Record<string, Record<string, { set_number: number; reps_completed: number | null; load_completed: number | null; rpe: number | null }[]>> = {};
  for (const l of workoutLogsRaw ?? []) {
    if (!logsByAthleteExercise[l.athlete_id]) logsByAthleteExercise[l.athlete_id] = {};
    if (!logsByAthleteExercise[l.athlete_id][l.workout_exercise_id]) logsByAthleteExercise[l.athlete_id][l.workout_exercise_id] = [];
    logsByAthleteExercise[l.athlete_id][l.workout_exercise_id].push({
      set_number: l.set_number,
      reps_completed: l.reps_completed,
      load_completed: l.load_completed,
      rpe: l.rpe,
    });
  }

  const loggedDetailAthletes = athletes.map((a) => ({
    athleteId: a.id,
    athleteName: a.full_name,
    setsByExercise: logsByAthleteExercise[a.id] ?? {},
  }));

  return (
    <div className="space-y-8">
      <WorkoutBuilder
        workout={workout}
        initialExercises={exercises}
        allExercises={allExercises ?? []}
        calendarId={id}
        athletes={athletes}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialOverrides={initialOverrides as any[]}
        maxesMap={maxesMap}
        prevWorkoutId={prevWorkoutId}
        nextWorkoutId={nextWorkoutId}
        backUrl={backUrl ?? null}
      />
      {athletes.length > 0 && (
        <div className="border-t pt-6">
          <AttendancePanel workoutId={wid} initialAttendance={initialAttendance} />
        </div>
      )}
      {athletes.length > 0 && (
        <div className="border-t pt-6">
          <LoggedDetailPanel
            exercises={exercises.map((e) => ({ id: e.id, name: e.exercise_name }))}
            athletes={loggedDetailAthletes}
          />
        </div>
      )}
    </div>
  );
}
