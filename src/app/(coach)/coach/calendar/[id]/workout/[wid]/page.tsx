import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkoutBuilder } from "@/components/coach/calendar/workout-builder";
import { AttendancePanel } from "@/components/coach/calendar/attendance-panel";

interface Props {
  params: Promise<{ id: string; wid: string }>;
}

export default async function WorkoutPage({ params }: Props) {
  const { id, wid } = await params;
  const supabase = await createClient();

  const [{ data: workout }, { data: rawExercises }, { data: allExercises }, { data: calendar }] = await Promise.all([
    supabase.from("workouts").select("*").eq("id", wid).single(),
    supabase
      .from("workout_exercises")
      .select("*, exercises(id, name, muscle_groups, category_id)")
      .eq("workout_id", wid)
      .order("sort_order"),
    supabase.from("exercises").select("id, name, category_id, muscle_groups").order("name"),
    supabase.from("calendars").select("team_id").eq("id", id).single(),
  ]);

  if (!workout || workout.calendar_id !== id) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exercises = (rawExercises ?? []).map((e: any) => ({
    ...e,
    exercise_name: (e.exercises as { name: string } | null)?.name ?? "",
  }));
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

  // Fetch existing attendance records for this workout
  const athleteIds = athletes.map((a) => a.id);
  const { data: attendanceRaw } = athleteIds.length > 0
    ? await supabase
        .from("attendance")
        .select("athlete_id, status, rpe_pre, rpe_post")
        .eq("workout_id", wid)
        .in("athlete_id", athleteIds)
    : { data: [] };

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
      />
      {athletes.length > 0 && (
        <div className="border-t pt-6">
          <AttendancePanel workoutId={wid} initialAttendance={initialAttendance} />
        </div>
      )}
    </div>
  );
}
