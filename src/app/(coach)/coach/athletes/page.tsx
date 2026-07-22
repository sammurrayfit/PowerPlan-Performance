import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { redirect } from "next/navigation";
import { AthleteRoster } from "@/components/coach/athletes/athlete-roster";
import { Leaderboard } from "@/components/coach/athletes/leaderboard";
import { AthletesPageTabs } from "@/components/coach/athletes/athletes-page-tabs";
import { MaxesImport, MaxesImportHint } from "@/components/coach/athletes/maxes-import";

export default async function AthletesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  // Fetch coach's teams + members
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("coach_id", effectiveCoachId)
    .order("name");

  const teamIds = (teams ?? []).map((t) => t.id);
  let memberships: { team_id: string; athlete_id: string; joined_at: string }[] = [];

  if (teamIds.length > 0) {
    const { data } = await supabase
      .from("team_memberships")
      .select("team_id, athlete_id, joined_at")
      .in("team_id", teamIds);
    memberships = data ?? [];
  }

  const athleteIds = [...new Set(memberships.map((m) => m.athlete_id))];
  let profiles: { id: string; full_name: string }[] = [];

  if (athleteIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", athleteIds);
    profiles = data ?? [];
  }

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const teamsWithAthletes = (teams ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    athletes: memberships
      .filter((m) => m.team_id === team.id)
      .map((m) => ({
        id: m.athlete_id,
        full_name: profileMap[m.athlete_id]?.full_name ?? "Unknown",
        joined_at: m.joined_at,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  }));

  // Fetch all maxes for leaderboard
  let allMaxes: {
    athlete_id: string;
    athlete_name: string;
    exercise_id: string;
    exercise_name: string;
    value: number;
    unit: string;
    date_recorded: string;
  }[] = [];

  if (athleteIds.length > 0) {
    const { data: maxesRaw } = await supabase
      .from("maxes")
      .select("athlete_id, exercise_id, value, unit, date_recorded, exercises(name)")
      .in("athlete_id", athleteIds)
      .order("date_recorded", { ascending: false });

    allMaxes = (maxesRaw ?? []).map((m) => ({
      athlete_id: m.athlete_id,
      athlete_name: profileMap[m.athlete_id]?.full_name ?? "Unknown",
      exercise_id: m.exercise_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercise_name: (m.exercises as any)?.name ?? "Unknown",
      value: Number(m.value),
      unit: m.unit,
      date_recorded: m.date_recorded,
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Athletes</h1>
        <MaxesImport />
      </div>
      <AthletesPageTabs
        roster={<AthleteRoster teams={teamsWithAthletes} />}
        leaderboard={<Leaderboard allMaxes={allMaxes} />}
        importHint={<MaxesImportHint />}
      />
    </div>
  );
}
