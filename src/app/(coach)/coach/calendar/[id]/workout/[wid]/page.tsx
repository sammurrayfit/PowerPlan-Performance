import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkoutBuilder } from "@/components/coach/calendar/workout-builder";

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
  const exercises = (rawExercises ?? []) as any[];
  const exerciseIds = exercises.map((e) => e.id);

  let athletes: { id: string; full_name: string }[] = [];
  let initialOverrides: object[] = [];

  if (calendar?.team_id) {
    const { data: memberships } = await supabase
      .from("team_memberships")
      .select("athlete_id")
      .eq("team_id", calendar.team_id);

    const athleteIds = (memberships ?? []).map((m) => m.athlete_id);

    if (athleteIds.length > 0) {
      const [{ data: profiles }, { data: overrides }] = await Promise.all([
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
      ]);

      athletes = profiles ?? [];
      initialOverrides = overrides ?? [];
    }
  }

  return (
    <WorkoutBuilder
      workout={workout}
      initialExercises={exercises}
      allExercises={allExercises ?? []}
      calendarId={id}
      athletes={athletes}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialOverrides={initialOverrides as any[]}
    />
  );
}
