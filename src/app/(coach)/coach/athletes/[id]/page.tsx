import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MaxesTable } from "@/components/coach/athletes/maxes-table";
import { AthleteSettings } from "@/components/coach/athletes/athlete-settings";
import { Badge } from "@/components/ui/badge";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default async function AthleteProfilePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { month } = await searchParams;
  const supabase = await createClient();
  const { data: { user: coach } } = await supabase.auth.getUser();

  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    year = y; monthIndex = m - 1;
  }
  const firstDay = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const lastDay = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(new Date(year, monthIndex + 1, 0).getDate()).padStart(2, "0")}`;

  const [
    { data: athlete },
    { data: maxesRaw },
    { data: prsRaw },
    { data: exercises },
    { data: memberships },
    { data: allCalendars },
  ] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").eq("id", id).single(),
    supabase.from("maxes").select("id, exercise_id, value, unit, date_recorded, exercises(id, name)").eq("athlete_id", id).order("date_recorded", { ascending: false }),
    supabase.from("personal_records").select("id, exercise_id, value, unit, date_achieved, exercises(id, name)").eq("athlete_id", id).order("date_achieved", { ascending: false }),
    supabase.from("exercises").select("id, name").order("name"),
    supabase.from("team_memberships").select("team_id").eq("athlete_id", id),
    coach ? supabase.from("calendars").select("id, name, team_id, athlete_id, color").eq("coach_id", coach.id).order("name") : Promise.resolve({ data: [] }),
  ]);

  if (!athlete || athlete.role !== "athlete") notFound();

  // Schedule: workouts from team calendars + individually assigned calendars
  const teamIds = (memberships ?? []).map((m) => m.team_id);
  const teamCalIds = (allCalendars ?? []).filter((c) => c.team_id && teamIds.includes(c.team_id)).map((c) => c.id);
  const individualCalIds = (allCalendars ?? []).filter((c) => c.athlete_id === id).map((c) => c.id);
  const calIds = [...new Set([...teamCalIds, ...individualCalIds])];
  const calNameMap = Object.fromEntries((allCalendars ?? []).map((c) => [c.id, c.name]));

  let scheduleWorkouts: {
    id: string; date: string; title: string; calendar_id: string; calendarName: string;
    exerciseNames: string[];
  }[] = [];

  if (calIds.length > 0) {
    const { data: wkts } = await supabase
      .from("workouts")
      .select("id, date, title, calendar_id")
      .in("calendar_id", calIds)
      .gte("date", firstDay)
      .lte("date", lastDay)
      .order("date");

    if (wkts && wkts.length > 0) {
      const wktIds = wkts.map((w) => w.id);
      const { data: weRows } = await supabase
        .from("workout_exercises")
        .select("workout_id, exercises(name)")
        .in("workout_id", wktIds)
        .order("sort_order");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exNamesByWorkout: Record<string, string[]> = {};
      for (const we of weRows ?? []) {
        if (!exNamesByWorkout[we.workout_id]) exNamesByWorkout[we.workout_id] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (we.exercises as any)?.name;
        if (name) exNamesByWorkout[we.workout_id].push(name);
      }

      scheduleWorkouts = wkts.map((w) => ({
        ...w,
        calendarName: calNameMap[w.calendar_id] ?? "",
        exerciseNames: exNamesByWorkout[w.id] ?? [],
      }));
    }
  }

  // Maxes
  const seenEx = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentMaxes = (maxesRaw ?? [] as any[]).reduce((acc: any[], m: any) => {
    if (!seenEx.has(m.exercise_id)) {
      seenEx.add(m.exercise_id);
      acc.push({ id: m.id, exercise_id: m.exercise_id, exercise_name: (m.exercises as any)?.name ?? "Unknown", value: Number(m.value), unit: m.unit, date_recorded: m.date_recorded });
    }
    return acc;
  }, []).sort((a: any, b: any) => a.exercise_name.localeCompare(b.exercise_name));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxHistory = (maxesRaw ?? [] as any[]).map((m: any) => ({
    id: m.id, exercise_id: m.exercise_id,
    exercise_name: (m.exercises as any)?.name ?? "Unknown",
    value: Number(m.value), unit: m.unit, date_recorded: m.date_recorded,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prs = (prsRaw ?? [] as any[]).map((pr: any) => ({
    id: pr.id, exercise_name: (pr.exercises as any)?.name ?? "Unknown",
    value: Number(pr.value), unit: pr.unit, date_achieved: pr.date_achieved,
  }));

  const prev = monthIndex === 0 ? { year: year - 1, month: 11 } : { year, month: monthIndex - 1 };
  const next = monthIndex === 11 ? { year: year + 1, month: 0 } : { year, month: monthIndex + 1 };
  const fmt = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <Link href="/coach/athletes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Athletes
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold shrink-0">
              {athlete.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{athlete.full_name}</h1>
              <p className="text-sm text-muted-foreground">
                Joined {new Date(athlete.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <AthleteSettings
            athleteId={id}
            allCalendars={(allCalendars ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color, assignedToThisAthlete: c.athlete_id === id }))}
          />
        </div>
      </div>

      {/* Schedule */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Schedule — {MONTH_NAMES[monthIndex]} {year}</h3>
          <div className="flex gap-1 text-xs">
            <Link href={`?month=${fmt(prev.year, prev.month)}`} className="px-2 py-1 rounded border hover:bg-muted transition-colors">‹</Link>
            <Link href="?" className="px-2 py-1 rounded border hover:bg-muted transition-colors">Today</Link>
            <Link href={`?month=${fmt(next.year, next.month)}`} className="px-2 py-1 rounded border hover:bg-muted transition-colors">›</Link>
          </div>
        </div>

        {scheduleWorkouts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No workouts this month.</p>
        ) : (
          <div className="rounded-lg border divide-y">
            {scheduleWorkouts.map((w) => (
              <Link
                key={w.id}
                href={`/coach/calendar/${w.calendar_id}/workout/${w.id}`}
                className="flex items-start justify-between px-4 py-3 hover:bg-muted/30 transition-colors gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{w.title}</p>
                  <p className="text-xs text-muted-foreground">{w.calendarName}</p>
                  {w.exerciseNames.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {w.exerciseNames.join(" · ")}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                  {new Date(w.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Maxes */}
      <MaxesTable
        athleteId={id}
        currentMaxes={currentMaxes}
        maxHistory={maxHistory}
        exercises={exercises ?? []}
      />

      {/* PR History */}
      <div className="space-y-3">
        <h3 className="font-semibold">PR History</h3>
        {prs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No PRs recorded yet.</p>
        ) : (
          <div className="rounded-lg border divide-y">
            {prs.map((pr) => (
              <div key={pr.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{pr.exercise_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(pr.date_achieved).toLocaleDateString()}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{pr.value} {pr.unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
