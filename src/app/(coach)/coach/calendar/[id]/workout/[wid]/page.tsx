import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkoutBuilder } from "@/components/coach/calendar/workout-builder";

interface Props {
  params: Promise<{ id: string; wid: string }>;
}

export default async function WorkoutPage({ params }: Props) {
  const { id, wid } = await params;
  const supabase = await createClient();

  const [{ data: workout }, { data: rawExercises }, { data: allExercises }] = await Promise.all([
    supabase.from("workouts").select("*").eq("id", wid).single(),
    supabase
      .from("workout_exercises")
      .select("*, exercises(id, name, muscle_groups, category_id)")
      .eq("workout_id", wid)
      .order("sort_order"),
    supabase.from("exercises").select("id, name, category_id, muscle_groups").order("name"),
  ]);

  if (!workout || workout.calendar_id !== id) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exercises = (rawExercises ?? []) as any[];

  return (
    <WorkoutBuilder
      workout={workout}
      initialExercises={exercises}
      allExercises={allExercises ?? []}
      calendarId={id}
    />
  );
}
