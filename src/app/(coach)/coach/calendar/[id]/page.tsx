import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { MonthView } from "@/components/coach/calendar/month-view";
import { ProgramImport } from "@/components/coach/calendar/program-import";
import { compareWorkoutOrder } from "@/lib/utils";

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

  return (
    <div className="space-y-6">
      <MonthView
        calendar={calendar}
        workouts={sortedWorkouts}
        year={year}
        month={monthIndex}
      />
      <ProgramImport calendarId={id} athletes={athletes} effectiveCoachId={effectiveCoachId!} />
    </div>
  );
}
