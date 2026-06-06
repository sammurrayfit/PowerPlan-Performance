import { createClient } from "@/lib/supabase/server";
import { RPEMonitor } from "@/components/coach/coaching-tools/rpe-monitor";

export default async function RPEPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().split("T")[0];

  // Get coach's calendars
  const { data: calendars } = await supabase
    .from("calendars")
    .select("id, team_id, athlete_id")
    .eq("coach_id", user.id);

  const calendarIds = (calendars ?? []).map((c) => c.id);

  // Today's workouts
  const { data: workouts } = calendarIds.length > 0
    ? await supabase
        .from("workouts")
        .select("id, title, calendar_id")
        .in("calendar_id", calendarIds)
        .eq("date", today)
        .order("title")
    : { data: [] };

  const workoutIds = (workouts ?? []).map((w) => w.id);
  const workoutTitles = Object.fromEntries((workouts ?? []).map((w) => [w.id, w.title]));

  // Resolve all athletes under those calendars
  const teamIds = (calendars ?? []).map((c) => c.team_id).filter(Boolean) as string[];
  const directAthleteIds = (calendars ?? []).map((c) => c.athlete_id).filter(Boolean) as string[];

  const { data: memberships } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("athlete_id").in("team_id", teamIds)
    : { data: [] };

  const allAthleteIds = [
    ...new Set([
      ...(memberships ?? []).map((m) => m.athlete_id),
      ...directAthleteIds,
    ]),
  ];

  const { data: athletes } = allAthleteIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", allAthleteIds)
        .order("full_name")
    : { data: [] };

  return (
    <RPEMonitor
      workoutIds={workoutIds}
      workoutTitles={workoutTitles}
      athletes={(athletes ?? []) as { id: string; full_name: string }[]}
    />
  );
}
