import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { MonthView } from "@/components/coach/calendar/month-view";
import { ProgramImport } from "@/components/coach/calendar/program-import";
import { compareWorkoutOrder } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dedupeExercises(rows: any[]): { id: string; name: string; muscle_groups: string[] }[] {
  const seen = new Map<string, { id: string; name: string; muscle_groups: string[] }>();
  for (const row of rows) {
    const ex = row.exercises;
    if (ex && !seen.has(ex.id)) seen.set(ex.id, { id: ex.id, name: ex.name, muscle_groups: ex.muscle_groups ?? [] });
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}

export default async function CalendarPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { month } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const effectiveCoachId = user ? await getEffectiveCoachId(supabase, user.id) : null;

  const { data: calendar } = await supabase
    .from("calendars")
    .select("*")
    .eq("id", id)
    .single();

  if (!calendar) notFound();

  // Parse month param or default to current month
  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth();

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    year = y;
    monthIndex = m - 1;
  }

  const firstDay = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0);
  const lastDayStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const { data: workouts } = await supabase
    .from("workouts")
    .select("id, date, title, is_locked")
    .eq("calendar_id", id)
    .gte("date", firstDay)
    .lte("date", lastDayStr)
    .order("date");
  const sortedWorkouts = (workouts ?? []).sort(compareWorkoutOrder);

  // Fetch athletes for program import override matching
  let athletes: { id: string; full_name: string }[] = [];
  if (calendar.team_id) {
    const { data: memberships } = await supabase
      .from("team_memberships")
      .select("athlete_id")
      .eq("team_id", calendar.team_id);
    const ids = (memberships ?? []).map((m) => m.athlete_id);
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      athletes = profiles ?? [];
    }
  }

  // All workout ids for this calendar (not just the visible month) so the
  // "Replace" dropdown always reflects the exercises actually programmed.
  const { data: allCalendarWorkouts } = await supabase.from("workouts").select("id").eq("calendar_id", id);
  const allWorkoutIds = (allCalendarWorkouts ?? []).map((w) => w.id);

  const [{ data: usedRows }, { data: allExercisesRaw }] = await Promise.all([
    allWorkoutIds.length > 0
      ? supabase.from("workout_exercises").select("exercises(id, name, muscle_groups)").in("workout_id", allWorkoutIds)
      : Promise.resolve({ data: [] }),
    supabase.from("exercises").select("id, name, category_id, muscle_groups").order("name"),
  ]);

  const usedExercises = dedupeExercises(usedRows ?? []);
  const allExercises = (allExercisesRaw ?? []).map((e) => ({ id: e.id, name: e.name, muscle_groups: e.muscle_groups ?? [] }));

  return (
    <div className="space-y-6">
      <MonthView
        calendar={calendar}
        workouts={sortedWorkouts}
        year={year}
        month={monthIndex}
        usedExercises={usedExercises}
        allExercises={allExercises}
      />
      <ProgramImport calendarId={id} athletes={athletes} effectiveCoachId={effectiveCoachId!} />
    </div>
  );
}
