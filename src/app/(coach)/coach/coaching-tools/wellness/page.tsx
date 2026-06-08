import { createClient } from "@/lib/supabase/server";
import { CoachWellnessView } from "@/components/coach/coaching-tools/wellness-view";

export default async function CoachWellnessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Get all athletes under this coach
  const { data: calendars } = await supabase
    .from("calendars")
    .select("team_id, athlete_id")
    .eq("coach_id", user.id);

  const teamIds = (calendars ?? []).map((c) => c.team_id).filter(Boolean) as string[];
  const directIds = (calendars ?? []).map((c) => c.athlete_id).filter(Boolean) as string[];

  const { data: memberships } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("athlete_id").in("team_id", teamIds)
    : { data: [] };

  const athleteIds = [...new Set([...(memberships ?? []).map((m) => m.athlete_id), ...directIds])];

  if (athleteIds.length === 0) {
    return <p className="text-sm text-muted-foreground py-8">No athletes assigned to your calendars yet.</p>;
  }

  const { data: athletes } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", athleteIds)
    .order("full_name");

  // Last 7 days of check-ins and nutrition
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  const [{ data: checkins }, { data: nutrition }] = await Promise.all([
    supabase
      .from("mental_checkins")
      .select("*")
      .in("athlete_id", athleteIds)
      .gte("date", sevenDaysAgo)
      .order("date", { ascending: false }),
    supabase
      .from("nutrition_logs")
      .select("*")
      .in("athlete_id", athleteIds)
      .gte("date", sevenDaysAgo)
      .order("date", { ascending: false }),
  ]);

  return (
    <CoachWellnessView
      athletes={(athletes ?? []) as { id: string; full_name: string }[]}
      checkins={checkins ?? []}
      nutrition={nutrition ?? []}
    />
  );
}
