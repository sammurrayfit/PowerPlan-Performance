import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId, getCoachGroupIds } from "@/lib/supabase/coach";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Users, Dumbbell, TrendingUp, Trophy, CheckCircle2, Circle } from "lucide-react";
import { compareWorkoutOrder } from "@/lib/utils";

// ── helpers ───────────────────────────────────────────────────────────────────

function isoWeekBounds(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7)); // roll back to Monday
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(mon), end: fmt(sun) };
}

function fmtShort(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── page ──────────────────────────────────────────────────────────────────────

export default async function CoachDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  const coachGroupIds = await getCoachGroupIds(supabase, effectiveCoachId);

  const { start: weekStart, end: weekEnd } = isoWeekBounds();
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  // ── Base coach data ─────────────────────────────────────────────────────────
  const [
    { count: calendarCount },
    { count: exerciseCount },
    { data: calendars },
    { data: teams },
  ] = await Promise.all([
    supabase.from("calendars").select("*", { count: "exact", head: true }).eq("coach_id", effectiveCoachId),
    supabase.from("exercises").select("*", { count: "exact", head: true }).in("created_by", coachGroupIds),
    supabase.from("calendars").select("id, name, team_id, athlete_id").eq("coach_id", effectiveCoachId),
    supabase.from("teams").select("id").eq("coach_id", effectiveCoachId),
  ]);

  const calIds = (calendars ?? []).map((c) => c.id);
  const teamIds = (calendars ?? []).map((c) => c.team_id).filter(Boolean) as string[];
  const directAthleteIds = (calendars ?? []).map((c) => c.athlete_id).filter(Boolean) as string[];

  // Athlete count
  let athleteIds: string[] = [...directAthleteIds];
  if (teams && teams.length > 0) {
    const { data: memberships } = await supabase
      .from("team_memberships")
      .select("athlete_id")
      .in("team_id", teams.map((t) => t.id));
    const teamAthleteIds = (memberships ?? []).map((m) => m.athlete_id);
    athleteIds = [...new Set([...athleteIds, ...teamAthleteIds])];
  }
  const athleteCount = athleteIds.length;

  if (calIds.length === 0) {
    // New coach — nothing set up yet
    const stats = [
      { label: "Calendars",  value: 0,             icon: CalendarDays },
      { label: "Athletes",   value: 0,             icon: Users },
      { label: "Exercises",  value: exerciseCount ?? 0, icon: Dumbbell },
      { label: "This week",  value: 0,             icon: TrendingUp },
    ];
    return <EmptyDashboard stats={stats} />;
  }

  // ── This week's workouts ────────────────────────────────────────────────────
  const { data: weekWorkoutsRaw } = await supabase
    .from("workouts")
    .select("id, title, date, calendar_id")
    .in("calendar_id", calIds)
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .order("date");
  const weekWorkouts = (weekWorkoutsRaw ?? []).sort(compareWorkoutOrder);

  const weekWorkoutIds = (weekWorkouts ?? []).map((w) => w.id);

  // Who's logged sets this week
  const { data: weekLogs } = weekWorkoutIds.length > 0
    ? await supabase
        .from("exercise_logs")
        .select("workout_id, athlete_id")
        .in("workout_id", weekWorkoutIds)
    : { data: [] };

  // Unique athletes who logged per workout
  const loggedByWorkout: Record<string, Set<string>> = {};
  for (const l of weekLogs ?? []) {
    if (!loggedByWorkout[l.workout_id]) loggedByWorkout[l.workout_id] = new Set();
    loggedByWorkout[l.workout_id].add(l.athlete_id);
  }

  // Workouts that happened today or in the past → count as "active"
  const completedCount = (weekWorkouts ?? []).filter((w) => {
    return w.date <= today && (loggedByWorkout[w.id]?.size ?? 0) > 0;
  }).length;

  // ── Recent PRs (last 7 days) ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentPRs } = athleteIds.length > 0
    ? await supabase
        .from("personal_records")
        .select("athlete_id, exercise_id, value, unit, date_achieved, exercises(name)")
        .in("athlete_id", athleteIds)
        .gte("date_achieved", sevenDaysAgo)
        .order("date_achieved", { ascending: false })
        .limit(8)
    : { data: [] };

  // Athlete names for PRs
  const prAthleteIds = [...new Set((recentPRs ?? []).map((r) => r.athlete_id))];
  const { data: prProfiles } = prAthleteIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", prAthleteIds)
    : { data: [] };
  const nameMap = Object.fromEntries((prProfiles ?? []).map((p) => [p.id, p.full_name]));

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = [
    { label: "Calendars",  value: calendarCount ?? 0, icon: CalendarDays },
    { label: "Athletes",   value: athleteCount,        icon: Users },
    { label: "Exercises",  value: exerciseCount ?? 0,  icon: Dumbbell },
    { label: "This week",  value: `${completedCount}/${(weekWorkouts ?? []).filter(w => w.date <= today).length}`, icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, Coach.</p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              {label === "This week" && (
                <p className="text-xs text-muted-foreground mt-0.5">workouts logged</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Two-column lower section ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* This week's schedule */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              This week
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {(weekWorkouts ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No workouts scheduled this week.
              </p>
            ) : (
              <div className="space-y-2">
                {(weekWorkouts ?? []).map((w) => {
                  const loggedCount = loggedByWorkout[w.id]?.size ?? 0;
                  const isPast = w.date <= today;
                  const hasLogs = loggedCount > 0;

                  return (
                    <Link
                      key={w.id}
                      href={`/coach/calendar/${w.calendar_id}/workout/${w.id}${hasLogs ? "?tab=logged" : ""}`}
                      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors -mx-3"
                    >
                      {isPast && hasLogs ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : isPast ? (
                        <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{w.title}</p>
                        <p className="text-xs text-muted-foreground">{fmtShort(w.date)}</p>
                      </div>
                      {isPast && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {loggedCount} logged
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent PRs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Recent PRs
              <span className="text-xs font-normal text-muted-foreground ml-1">last 7 days</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {(recentPRs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No PRs in the last 7 days.
              </p>
            ) : (
              <div className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(recentPRs ?? [] as any[]).map((pr: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {nameMap[pr.athlete_id] ?? "Athlete"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {(pr.exercises as { name: string } | null)?.name ?? "Exercise"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-300 shrink-0 tabular-nums">
                      {pr.value} {pr.unit}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Empty state for new coaches ───────────────────────────────────────────────

function EmptyDashboard({ stats }: { stats: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }> }[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, Coach.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Getting started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Add exercises to your library</p>
          <p>2. Create a calendar for your team</p>
          <p>3. Build your first workout</p>
          <p>4. Invite your athletes</p>
        </CardContent>
      </Card>
    </div>
  );
}
