import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { WorkoutExportForm } from "@/components/coach/athletes/workout-export";

export default async function ExportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("coach_id", effectiveCoachId)
    .order("name");

  const teamIds = (teams ?? []).map((t) => t.id);
  const { data: memberships } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("team_id, athlete_id").in("team_id", teamIds)
    : { data: [] };

  const athleteIds = [...new Set((memberships ?? []).map((m) => m.athlete_id))];
  const { data: profiles } = athleteIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", athleteIds)
    : { data: [] };
  const nameById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  const teamsWithAthletes = (teams ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    athletes: (memberships ?? [])
      .filter((m) => m.team_id === team.id)
      .map((m) => ({ id: m.athlete_id, full_name: nameById[m.athlete_id] ?? "Unknown" }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  }));

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Export workouts</h2>
        <p className="text-sm text-muted-foreground">
          Download players&apos; scheduled workouts and what they logged as an Excel file. Choose a date range and the players to include.
        </p>
      </div>
      <WorkoutExportForm teams={teamsWithAthletes} inline />
    </div>
  );
}
