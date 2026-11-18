import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { RPEMonitor } from "@/components/coach/coaching-tools/rpe-monitor";

export default async function RPEPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  // Get coach's calendars
  const { data: calendars } = await supabase
    .from("calendars")
    .select("id, team_id, athlete_id")
    .eq("coach_id", effectiveCoachId);

  const calendarIds = (calendars ?? []).map((c) => c.id);

  // Resolve all athletes under those calendars
  const teamIds = (calendars ?? []).map((c) => c.team_id).filter(Boolean) as string[];
  const directAthleteIds = (calendars ?? []).map((c) => c.athlete_id).filter(Boolean) as string[];

  const { data: memberships } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("team_id, athlete_id").in("team_id", teamIds)
    : { data: [] };

  const { data: teams } = teamIds.length > 0
    ? await supabase.from("teams").select("id, name").in("id", teamIds).order("name")
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

  // Age group = team name (U13, U15, ...); an athlete can be in more than one
  const teamName = Object.fromEntries((teams ?? []).map((t) => [t.id, t.name as string]));
  const athleteGroups: Record<string, string[]> = {};
  for (const m of memberships ?? []) {
    const name = teamName[m.team_id];
    if (name) (athleteGroups[m.athlete_id] ??= []).push(name);
  }

  return (
    <RPEMonitor
      calendarIds={calendarIds}
      athletes={((athletes ?? []) as { id: string; full_name: string }[]).map((a) => ({
        ...a,
        groups: [...new Set(athleteGroups[a.id] ?? [])].sort(),
      }))}
      ageGroups={[...new Set(Object.values(teamName))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      )}
    />
  );
}
