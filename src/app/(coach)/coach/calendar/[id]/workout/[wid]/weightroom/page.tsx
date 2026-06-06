import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WeightroomView } from "@/components/coach/calendar/weightroom-view";

interface Props {
  params: Promise<{ id: string; wid: string }>;
}

export default async function WeightroomPage({ params }: Props) {
  const { id, wid } = await params;
  const supabase = await createClient();

  const [{ data: workout }, { data: rawExercises }, { data: calendar }] = await Promise.all([
    supabase.from("workouts").select("id, title, date, is_locked").eq("id", wid).single(),
    supabase
      .from("workout_exercises")
      .select("id, sort_order, sets, exercises(id, name)")
      .eq("workout_id", wid)
      .order("sort_order"),
    supabase.from("calendars").select("team_id, athlete_id").eq("id", id).single(),
  ]);

  if (!workout) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exercises = (rawExercises ?? []).map((e: any) => ({
    id: e.id as string,
    sort_order: e.sort_order as number,
    sets: (e.sets ?? 1) as number,
    name: (e.exercises as { name: string } | null)?.name ?? "Unknown",
  }));

  const weIds = exercises.map((e) => e.id);

  // Build athlete list from team or individual assignment
  let athletes: { id: string; full_name: string }[] = [];
  if (calendar?.team_id) {
    const { data: memberships } = await supabase
      .from("team_memberships")
      .select("athlete_id")
      .eq("team_id", calendar.team_id);
    const ids = (memberships ?? []).map((m) => m.athlete_id);
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids)
        .order("full_name");
      athletes = profiles ?? [];
    }
  } else if (calendar?.athlete_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", calendar.athlete_id)
      .single();
    if (profile) athletes = [profile];
  }

  const athleteIds = athletes.map((a) => a.id);

  // Fetch initial logs
  const { data: logsRaw } = weIds.length > 0 && athleteIds.length > 0
    ? await supabase
        .from("exercise_logs")
        .select("id, workout_exercise_id, athlete_id, set_number")
        .eq("workout_id", wid)
        .in("workout_exercise_id", weIds)
        .in("athlete_id", athleteIds)
    : { data: [] };

  return (
    <WeightroomView
      workout={workout}
      exercises={exercises}
      athletes={athletes}
      initialLogs={logsRaw ?? []}
      workoutId={wid}
      calendarId={id}
    />
  );
}
