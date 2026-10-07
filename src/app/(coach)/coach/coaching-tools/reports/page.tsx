import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { ReportsShell, type ReportFilters } from "@/components/coach/coaching-tools/reports/reports-shell";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  // Fetch all athletes under this coach
  const { data: calendars } = await supabase
    .from("calendars")
    .select("team_id, athlete_id")
    .eq("coach_id", effectiveCoachId);

  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name")
    .eq("coach_id", effectiveCoachId)
    .order("name");

  const teamIds = [...new Set([
    ...(calendars ?? []).map((c) => c.team_id).filter(Boolean),
    ...(teamRows ?? []).map((t) => t.id),
  ])] as string[];
  const directIds = (calendars ?? []).map((c) => c.athlete_id).filter(Boolean) as string[];

  const { data: memberships } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("team_id, athlete_id").in("team_id", teamIds)
    : { data: [] };

  const athleteIds = [
    ...new Set([...(memberships ?? []).map((m) => m.athlete_id), ...directIds]),
  ];

  const { data: athletes } = athleteIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", athleteIds).order("full_name")
    : { data: [] };

  const teams = (teamRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    athleteIds: (memberships ?? []).filter((m) => m.team_id === t.id).map((m) => m.athlete_id),
  }));

  // Exercises that have maxes recorded (for max progression filter)
  const { data: maxExercises } = athleteIds.length > 0
    ? await supabase
        .from("maxes")
        .select("exercise_id, exercises(id, name)")
        .in("athlete_id", athleteIds)
    : { data: [] };

  const exerciseMap = new Map<string, string>();
  for (const m of maxExercises ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (m as any).exercises;
    if (ex?.id && ex?.name) exerciseMap.set(ex.id, ex.name);
  }
  const exercises = [...exerciseMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (athleteIds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8">
        No athletes assigned to your calendars yet.
      </p>
    );
  }

  const sp = await searchParams;
  const param = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const initial: Partial<ReportFilters> = {
    report: param("report") as ReportFilters["report"],
    range: param("range") as ReportFilters["range"],
    date: param("date"),
    team: param("team"),
    athlete: param("athlete"),
    exercise: param("exercise"),
  };

  return (
    <ReportsShell
      coachId={effectiveCoachId}
      athletes={(athletes ?? []) as { id: string; full_name: string }[]}
      teams={teams}
      exercises={exercises}
      initial={initial}
    />
  );
}
