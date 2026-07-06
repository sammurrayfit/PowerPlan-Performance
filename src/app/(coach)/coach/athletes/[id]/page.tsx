import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MaxesTable } from "@/components/coach/athletes/maxes-table";
import { AthleteSettings } from "@/components/coach/athletes/athlete-settings";
import { AthleteCalendar } from "@/components/coach/athletes/athlete-calendar";
import { BackButton } from "@/components/ui/back-button";
import { compareWorkoutOrder } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; date?: string; month?: string; back?: string }>;
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default async function AthleteProfilePage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const backUrl = sp.back ?? null;
  const supabase = await createClient();
  const { data: { user: coach } } = await supabase.auth.getUser();

  // ── View + focus date ──────────────────────────────────────────────────────
  const view =
    sp.view === "week" || sp.view === "day" ? sp.view : "month";

  const todayStr = toDateStr(new Date());
  const focusDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayStr;

  // Parse the month containing focusDate for the fetch range
  const [fy, fm] = focusDate.split("-").map(Number);
  // Fetch a 3-month window centred on the focus month so week view at
  // month boundaries (and prev/next navigation) never shows empty edges.
  const rangeStart = new Date(fy, fm - 2, 1); // one month before
  const rangeEnd   = new Date(fy, fm + 1,  0); // one month after (last day)
  const firstDay   = toDateStr(rangeStart);
  const lastDay    = toDateStr(rangeEnd);

  // ── Data fetching ──────────────────────────────────────────────────────────
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
    coach
      ? supabase.from("calendars").select("id, name, team_id, athlete_id, color").eq("coach_id", coach.id).order("name")
      : Promise.resolve({ data: [] }),
  ]);

  if (!athlete || athlete.role !== "athlete") notFound();

  // ── Calendars that apply to this athlete ──────────────────────────────────
  const teamIds = (memberships ?? []).map((m) => m.team_id);
  const teamCalIds = (allCalendars ?? [])
    .filter((c) => c.team_id && teamIds.includes(c.team_id))
    .map((c) => c.id);
  const individualCalIds = (allCalendars ?? [])
    .filter((c) => c.athlete_id === id)
    .map((c) => c.id);
  const calIds = [...new Set([...teamCalIds, ...individualCalIds])];

  const calMap = Object.fromEntries(
    (allCalendars ?? []).map((c) => [c.id, { name: c.name, color: c.color }])
  );

  // ── Workouts ──────────────────────────────────────────────────────────────
  type CalWorkout = {
    id: string; date: string; title: string; calendar_id: string;
    calendarName: string; calendarColor: string;
  };
  let scheduleWorkouts: CalWorkout[] = [];

  if (calIds.length > 0) {
    const { data: wkts } = await supabase
      .from("workouts")
      .select("id, date, title, calendar_id")
      .in("calendar_id", calIds)
      .gte("date", firstDay)
      .lte("date", lastDay)
      .order("date");

    scheduleWorkouts = (wkts ?? [])
      .map((w) => ({
        ...w,
        calendarName:  calMap[w.calendar_id]?.name  ?? "",
        calendarColor: calMap[w.calendar_id]?.color ?? "#32127A",
      }))
      .sort(compareWorkoutOrder);
  }

  // ── Maxes ─────────────────────────────────────────────────────────────────
  const seenEx = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentMaxes = (maxesRaw ?? [] as any[]).reduce((acc: any[], m: any) => {
    if (!seenEx.has(m.exercise_id)) {
      seenEx.add(m.exercise_id);
      acc.push({ id: m.id, exercise_id: m.exercise_id, exercise_name: (m.exercises as any)?.name ?? "Unknown", value: Number(m.value), unit: m.unit, date_recorded: m.date_recorded });
    }
    return acc;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <BackButton label={backUrl ? "Calendar" : "Athletes"} href={backUrl ?? null} fallback="/coach/athletes" />
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
            allCalendars={(allCalendars ?? []).map((c) => ({
              id: c.id, name: c.name, color: c.color,
              assignedToThisAthlete: c.athlete_id === id,
            }))}
          />
        </div>
      </div>

      {/* Calendar */}
      <AthleteCalendar
        athleteId={id}
        workouts={scheduleWorkouts}
        view={view}
        focusDate={focusDate}
      />

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
