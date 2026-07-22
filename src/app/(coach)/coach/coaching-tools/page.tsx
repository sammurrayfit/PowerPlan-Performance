import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { WeightroomKiosk } from "@/components/coach/weightroom/weightroom-kiosk";

export default async function CoachingToolsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  const today = new Date().toISOString().split("T")[0];

  const { data: calendars } = await supabase
    .from("calendars")
    .select("id, name, team_id, athlete_id")
    .eq("coach_id", effectiveCoachId);

  const calendarIds = (calendars ?? []).map((c) => c.id);
  const { data: workouts } = calendarIds.length > 0
    ? await supabase
        .from("workouts")
        .select("id, title, date, calendar_id")
        .in("calendar_id", calendarIds)
        .eq("date", today)
        .order("title")
    : { data: [] };

  const teamIds = (calendars ?? []).map((c) => c.team_id).filter(Boolean) as string[];
  const directAthleteIds = (calendars ?? []).map((c) => c.athlete_id).filter(Boolean) as string[];

  const { data: memberships } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("team_id, athlete_id").in("team_id", teamIds)
    : { data: [] };

  const allAthleteIds = [
    ...new Set([
      ...(memberships ?? []).map((m) => m.athlete_id),
      ...directAthleteIds,
    ]),
  ];

  const { data: allProfiles } = allAthleteIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", allAthleteIds).order("full_name")
    : { data: [] };

  const calendarAthletes: Record<string, string[]> = {};
  for (const cal of calendars ?? []) {
    const ids: string[] = [];
    if (cal.team_id) {
      ids.push(...(memberships ?? []).filter((m) => m.team_id === cal.team_id).map((m) => m.athlete_id));
    }
    if (cal.athlete_id) ids.push(cal.athlete_id);
    calendarAthletes[cal.id] = [...new Set(ids)];
  }

  const workoutsWithAthletes = (workouts ?? []).map((w) => ({
    id: w.id, title: w.title, date: w.date, calendarId: w.calendar_id,
    athleteIds: calendarAthletes[w.calendar_id] ?? [],
  }));

  return (
    <WeightroomKiosk
      workouts={workoutsWithAthletes}
      profiles={(allProfiles ?? []) as { id: string; full_name: string }[]}
    />
  );
}
