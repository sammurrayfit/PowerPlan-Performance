import { createClient } from "@/lib/supabase/server";
import { CalendarList } from "@/components/coach/calendar/calendar-list";

export default async function CalendarsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: calendars }, { data: teams }] = await Promise.all([
    supabase.from("calendars").select("*").eq("coach_id", user!.id).is("athlete_id", null).order("created_at"),
    supabase.from("teams").select("id, name").eq("coach_id", user!.id).order("name"),
  ]);

  // Fetch athletes for any team-linked calendars
  const teamIds = [
    ...new Set((calendars ?? []).map((c) => c.team_id).filter(Boolean)),
  ] as string[];

  let athletesByTeam: Record<string, { id: string; full_name: string }[]> = {};

  if (teamIds.length > 0) {
    const { data: memberships } = await supabase
      .from("team_memberships")
      .select("team_id, athlete_id")
      .in("team_id", teamIds);

    const athleteIds = [
      ...new Set((memberships ?? []).map((m) => m.athlete_id)),
    ];

    if (athleteIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", athleteIds);

      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.id, p])
      );

      for (const m of memberships ?? []) {
        if (!athletesByTeam[m.team_id]) athletesByTeam[m.team_id] = [];
        const profile = profileMap[m.athlete_id];
        if (profile) athletesByTeam[m.team_id].push(profile);
      }

      // Sort athletes alphabetically within each team
      for (const tid of Object.keys(athletesByTeam)) {
        athletesByTeam[tid].sort((a, b) => a.full_name.localeCompare(b.full_name));
      }
    }
  }

  return (
    <CalendarList
      calendars={calendars ?? []}
      teams={teams ?? []}
      coachId={user!.id}
      athletesByTeam={athletesByTeam}
    />
  );
}
