"use server";

import { createClient } from "@/lib/supabase/server";
import { isTimedReps } from "@/lib/pr";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ── Date range helpers ────────────────────────────────────────────────────────

function dateRangeBounds(range: string): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (range === "7d")  start.setDate(end.getDate() - 7);
  if (range === "30d") start.setDate(end.getDate() - 30);
  if (range === "90d") start.setDate(end.getDate() - 90);
  if (range === "all") start.setFullYear(2000);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(start), end: fmt(end) };
}

// Monday of the week containing `dateStr`, as YYYY-MM-DD.
function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ── Large-list queries ────────────────────────────────────────────────────────

// PostgREST caps every response at 1000 rows, and a long `.in()` list can
// overflow the request URL. Split the ids into chunks and page each chunk so
// reports over a whole roster and season see every row.
const ID_CHUNK = 100;
const PAGE = 1000;

async function selectIn<T>(
  ids: string[],
  run: (chunk: string[], from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  // Chunks run in parallel; pages within a chunk run in order (queries must
  // sort on a unique column so pages don't overlap).
  const results = await Promise.all(chunks.map(async (chunk) => {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await run(chunk, from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }));
  return results.flat();
}

async function profileNames(supabase: Supabase, ids: string[]): Promise<Record<string, string>> {
  const rows = await selectIn<{ id: string; full_name: string }>(ids, (c, f, t) =>
    supabase.from("profiles").select("id, full_name").in("id", c).order("id").range(f, t)
  );
  return Object.fromEntries(rows.map((p) => [p.id, p.full_name]));
}

// ── Shared: the coach's calendars and athletes, optionally narrowed to a team ─

async function getCoachScope(supabase: Supabase, coachId: string, teamId?: string | null) {
  const { data: calendars } = await supabase
    .from("calendars")
    .select("id, team_id, athlete_id")
    .eq("coach_id", coachId);
  const cals = calendars ?? [];

  const teamIds = [...new Set(cals.map((c) => c.team_id).filter(Boolean))] as string[];
  if (teamId && !teamIds.includes(teamId)) teamIds.push(teamId);
  const { data: memberships } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("team_id, athlete_id").in("team_id", teamIds)
    : { data: [] };

  const athletesByTeam: Record<string, string[]> = {};
  for (const m of memberships ?? []) (athletesByTeam[m.team_id] ??= []).push(m.athlete_id);

  // A workout on a team calendar applies to every member; on an individual
  // calendar, to that one athlete.
  const athletesByCalendar: Record<string, string[]> = {};
  for (const c of cals) {
    if (c.athlete_id) athletesByCalendar[c.id] = [c.athlete_id];
    else if (c.team_id) athletesByCalendar[c.id] = athletesByTeam[c.team_id] ?? [];
  }

  let athleteIds = [...new Set(Object.values(athletesByCalendar).flat())];
  let calIds = cals.map((c) => c.id);
  if (teamId) {
    const members = new Set(athletesByTeam[teamId] ?? []);
    athleteIds = athleteIds.filter((id) => members.has(id));
    calIds = cals.filter((c) => c.team_id === teamId || (c.athlete_id && members.has(c.athlete_id))).map((c) => c.id);
  }

  return { calIds, athleteIds, athletesByCalendar };
}

function targetAthletes(athleteIds: string[], athleteId: string): string[] {
  if (athleteId === "all") return athleteIds;
  return athleteIds.includes(athleteId) ? [athleteId] : [];
}

async function workoutsInRange(supabase: Supabase, calIds: string[], start: string, end: string, excludePreActivation = false) {
  return selectIn<{ id: string; calendar_id: string; date: string; title: string }>(calIds, (c, f, t) => {
    let q = supabase.from("workouts").select("id, calendar_id, date, title").in("calendar_id", c).gte("date", start).lte("date", end);
    if (excludePreActivation) q = q.neq("title", "Pre-Activation");
    return q.order("id").range(f, t);
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AttendanceRow = {
  athleteId: string;
  athleteName: string;
  present: number;
  late: number;
  absent: number;
  total: number;
  pct: number;
};

export type VolumeWeek = {
  weekStart: string; // YYYY-MM-DD (Monday)
  volume: number;
  sets: number;
};

export type VolumeAthlete = {
  athleteId: string;
  athleteName: string;
  totalSets: number;
  totalVolume: number;
};

export type VolumeRow = {
  athleteId: string;
  athleteName: string;
  exerciseName: string;
  totalSets: number;
  totalReps: number;
  totalVolume: number;
};

export type PRRow = {
  date: string;
  athleteId: string;
  athleteName: string;
  exerciseId: string;
  exerciseName: string;
  value: number;
  unit: string;
};

export type MaxRow = {
  athleteId: string;
  athleteName: string;
  exerciseId: string;
  exerciseName: string;
  current: number;
  unit: string;
  history: { date: string; value: number }[];
};

export type CompletedWorkoutRow = {
  workoutId: string;
  calendarId: string;
  date: string;
  title: string;
  athleteId: string;
  athleteName: string;
  attendanceStatus: "present" | "late" | "absent" | null;
  loggedExercises: number;
  totalExercises: number;
};

export type RPERow = {
  date: string;
  athleteId: string;
  athleteName: string;
  rpe_pre: number | null;
  rpe_post: number | null;
  workoutTitle: string;
};

// ── 1. Attendance ─────────────────────────────────────────────────────────────

export async function fetchAttendanceReport(
  coachId: string,
  range: string,
  athleteId: string,
  teamId?: string | null
): Promise<AttendanceRow[]> {
  const supabase = await createClient();
  const { start, end } = dateRangeBounds(range);
  const { calIds, athleteIds } = await getCoachScope(supabase, coachId, teamId);
  const targets = targetAthletes(athleteIds, athleteId);
  if (calIds.length === 0 || targets.length === 0) return [];

  const workouts = await workoutsInRange(supabase, calIds, start, end);
  if (workouts.length === 0) return [];

  const targetSet = new Set(targets);
  const attendance = (await selectIn<{ athlete_id: string; status: string }>(workouts.map((w) => w.id), (c, f, t) =>
    supabase.from("attendance").select("id, athlete_id, status").in("workout_id", c).order("id").range(f, t)
  )).filter((a) => targetSet.has(a.athlete_id));

  const names = await profileNames(supabase, targets);
  const counts: Record<string, { present: number; late: number; absent: number }> = {};
  for (const id of targets) counts[id] = { present: 0, late: 0, absent: 0 };
  for (const a of attendance) {
    if (a.status === "present") counts[a.athlete_id].present++;
    if (a.status === "late")    counts[a.athlete_id].late++;
    if (a.status === "absent")  counts[a.athlete_id].absent++;
  }

  return targets
    .map((id) => {
      const c = counts[id];
      const total = c.present + c.late + c.absent;
      return {
        athleteId: id,
        athleteName: names[id] ?? "Unknown",
        ...c,
        total,
        pct: total > 0 ? Math.round(((c.present + c.late) / total) * 100) : 0,
      };
    })
    .sort((a, b) => a.athleteName.localeCompare(b.athleteName));
}

// ── 1b. Completed workouts ────────────────────────────────────────────────────

export async function fetchCompletedWorkouts(
  coachId: string,
  range: string,
  athleteId: string,
  specificDate?: string | null,
  teamId?: string | null
): Promise<CompletedWorkoutRow[]> {
  const supabase = await createClient();
  const { start, end } = specificDate ? { start: specificDate, end: specificDate } : dateRangeBounds(range);
  const { calIds, athleteIds, athletesByCalendar } = await getCoachScope(supabase, coachId, teamId);
  const targets = targetAthletes(athleteIds, athleteId);
  if (calIds.length === 0 || targets.length === 0) return [];
  const targetSet = new Set(targets);

  const workouts = await workoutsInRange(supabase, calIds, start, end, true);
  if (workouts.length === 0) return [];
  const workoutIds = workouts.map((w) => w.id);

  const [names, attendance, exercises, logs] = await Promise.all([
    profileNames(supabase, targets),
    selectIn<{ workout_id: string; athlete_id: string; status: "present" | "late" | "absent" }>(workoutIds, (c, f, t) =>
      supabase.from("attendance").select("id, workout_id, athlete_id, status").in("workout_id", c).order("id").range(f, t)
    ),
    selectIn<{ workout_id: string }>(workoutIds, (c, f, t) =>
      supabase.from("workout_exercises").select("id, workout_id").in("workout_id", c).order("id").range(f, t)
    ),
    selectIn<{ workout_id: string; athlete_id: string; workout_exercise_id: string }>(workoutIds, (c, f, t) =>
      supabase.from("exercise_logs").select("id, workout_id, athlete_id, workout_exercise_id").in("workout_id", c).order("id").range(f, t)
    ),
  ]);

  const totalExByWorkout: Record<string, number> = {};
  for (const e of exercises) totalExByWorkout[e.workout_id] = (totalExByWorkout[e.workout_id] ?? 0) + 1;

  const attendanceByWA: Record<string, "present" | "late" | "absent"> = {};
  for (const a of attendance) attendanceByWA[`${a.workout_id}|${a.athlete_id}`] = a.status;

  const loggedExByWA: Record<string, Set<string>> = {};
  for (const l of logs) (loggedExByWA[`${l.workout_id}|${l.athlete_id}`] ??= new Set()).add(l.workout_exercise_id);

  const rows: CompletedWorkoutRow[] = [];
  for (const w of workouts) {
    for (const aid of (athletesByCalendar[w.calendar_id] ?? []).filter((id) => targetSet.has(id))) {
      const key = `${w.id}|${aid}`;
      rows.push({
        workoutId: w.id,
        calendarId: w.calendar_id,
        date: w.date,
        title: w.title,
        athleteId: aid,
        athleteName: names[aid] ?? "Unknown",
        attendanceStatus: attendanceByWA[key] ?? null,
        loggedExercises: loggedExByWA[key]?.size ?? 0,
        totalExercises: totalExByWorkout[w.id] ?? 0,
      });
    }
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || a.athleteName.localeCompare(b.athleteName));
  return rows;
}

// ── 2. Volume ─────────────────────────────────────────────────────────────────

export async function fetchVolumeReport(
  coachId: string,
  range: string,
  athleteId: string,
  teamId?: string | null
): Promise<{ weeks: VolumeWeek[]; athletes: VolumeAthlete[]; rows: VolumeRow[] }> {
  const empty = { weeks: [], athletes: [], rows: [] };
  const supabase = await createClient();
  const { start, end } = dateRangeBounds(range);
  const { calIds, athleteIds } = await getCoachScope(supabase, coachId, teamId);
  const targets = targetAthletes(athleteIds, athleteId);
  if (calIds.length === 0 || targets.length === 0) return empty;
  const targetSet = new Set(targets);

  const workouts = await workoutsInRange(supabase, calIds, start, end);
  if (workouts.length === 0) return empty;
  const dateByWorkout = Object.fromEntries(workouts.map((w) => [w.id, w.date]));

  const logs = (await selectIn<{ athlete_id: string; workout_id: string; workout_exercise_id: string; reps_completed: number | null; load_completed: number | null }>(
    workouts.map((w) => w.id),
    (c, f, t) => supabase.from("exercise_logs")
      .select("id, athlete_id, workout_id, workout_exercise_id, reps_completed, load_completed")
      .in("workout_id", c).order("id").range(f, t)
  )).filter((l) => targetSet.has(l.athlete_id));
  if (logs.length === 0) return empty;

  const weIds = [...new Set(logs.map((l) => l.workout_exercise_id))];
  const wes = await selectIn<{ id: string; reps: string | null; exercises: { name: string } | null }>(weIds, (c, f, t) =>
    supabase.from("workout_exercises").select("id, reps, exercises(name)").in("id", c).order("id").range(f, t)
  );
  const weById = Object.fromEntries(wes.map((we) => [we.id, we]));
  const names = await profileNames(supabase, targets);

  const weekAcc: Record<string, VolumeWeek> = {};
  const athleteAcc: Record<string, VolumeAthlete> = {};
  const rowAcc: Record<string, VolumeRow> = {};

  for (const l of logs) {
    const we = weById[l.workout_exercise_id];
    // A timed set's "reps" are seconds held — count the set but not tonnage.
    const vol = isTimedReps(we?.reps) ? 0 : (l.reps_completed ?? 0) * (l.load_completed ?? 0);
    const week = weekStart(dateByWorkout[l.workout_id]);
    const exName = we?.exercises?.name ?? "Unknown";

    const wk = (weekAcc[week] ??= { weekStart: week, volume: 0, sets: 0 });
    wk.volume += vol; wk.sets++;

    const ath = (athleteAcc[l.athlete_id] ??= { athleteId: l.athlete_id, athleteName: names[l.athlete_id] ?? "Unknown", totalSets: 0, totalVolume: 0 });
    ath.totalVolume += vol; ath.totalSets++;

    const row = (rowAcc[`${l.athlete_id}|${exName}`] ??= {
      athleteId: l.athlete_id, athleteName: ath.athleteName, exerciseName: exName, totalSets: 0, totalReps: 0, totalVolume: 0,
    });
    row.totalSets++; row.totalReps += isTimedReps(we?.reps) ? 0 : l.reps_completed ?? 0; row.totalVolume += vol;
  }

  return {
    weeks: Object.values(weekAcc).sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    athletes: Object.values(athleteAcc).sort((a, b) => b.totalVolume - a.totalVolume),
    rows: Object.values(rowAcc).sort((a, b) => b.totalVolume - a.totalVolume),
  };
}

// ── 3. PR History ─────────────────────────────────────────────────────────────

export async function fetchPRReport(
  coachId: string,
  range: string,
  athleteId: string,
  teamId?: string | null
): Promise<PRRow[]> {
  const supabase = await createClient();
  const { start, end } = dateRangeBounds(range);
  const { athleteIds } = await getCoachScope(supabase, coachId, teamId);
  const targets = targetAthletes(athleteIds, athleteId);
  if (targets.length === 0) return [];

  const prs = await selectIn<{ athlete_id: string; exercise_id: string; value: number; unit: string; date_achieved: string; exercises: { name: string } | null }>(
    targets,
    (c, f, t) => supabase.from("personal_records")
      .select("id, athlete_id, exercise_id, value, unit, date_achieved, exercises(name)")
      .in("athlete_id", c).gte("date_achieved", start).lte("date_achieved", end)
      .order("id").range(f, t)
  );
  const names = await profileNames(supabase, targets);

  return prs
    .map((pr) => ({
      date: pr.date_achieved,
      athleteId: pr.athlete_id,
      athleteName: names[pr.athlete_id] ?? "Unknown",
      exerciseId: pr.exercise_id,
      exerciseName: pr.exercises?.name ?? "Unknown",
      value: Number(pr.value),
      unit: pr.unit,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ── 4. RPE Trends ────────────────────────────────────────────────────────────

export async function fetchRPEReport(
  coachId: string,
  range: string,
  athleteId: string,
  teamId?: string | null
): Promise<RPERow[]> {
  const supabase = await createClient();
  const { start, end } = dateRangeBounds(range);
  const { calIds, athleteIds } = await getCoachScope(supabase, coachId, teamId);
  const targets = targetAthletes(athleteIds, athleteId);
  if (calIds.length === 0 || targets.length === 0) return [];
  const targetSet = new Set(targets);

  const workouts = await workoutsInRange(supabase, calIds, start, end);
  if (workouts.length === 0) return [];
  const workoutMeta = Object.fromEntries(workouts.map((w) => [w.id, w]));

  const attendance = (await selectIn<{ athlete_id: string; workout_id: string; rpe_pre: number | null; rpe_post: number | null }>(
    workouts.map((w) => w.id),
    (c, f, t) => supabase.from("attendance")
      .select("id, athlete_id, workout_id, rpe_pre, rpe_post")
      .in("workout_id", c).not("rpe_pre", "is", null).order("id").range(f, t)
  )).filter((a) => targetSet.has(a.athlete_id));
  const names = await profileNames(supabase, targets);

  return attendance
    .map((a) => ({
      date: workoutMeta[a.workout_id].date,
      athleteId: a.athlete_id,
      athleteName: names[a.athlete_id] ?? "Unknown",
      rpe_pre: a.rpe_pre,
      rpe_post: a.rpe_post,
      workoutTitle: workoutMeta[a.workout_id].title,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ── 5. Max Progression ────────────────────────────────────────────────────────

export async function fetchMaxProgressionReport(
  coachId: string,
  athleteId: string,
  exerciseId: string,
  teamId?: string | null
): Promise<MaxRow[]> {
  const supabase = await createClient();
  const { athleteIds } = await getCoachScope(supabase, coachId, teamId);
  const targets = targetAthletes(athleteIds, athleteId);
  if (targets.length === 0) return [];

  const maxes = await selectIn<{ athlete_id: string; exercise_id: string; value: number; unit: string; date_recorded: string; exercises: { name: string } | null }>(
    targets,
    (c, f, t) => {
      let q = supabase.from("maxes")
        .select("id, athlete_id, exercise_id, value, unit, date_recorded, exercises(name)")
        .in("athlete_id", c);
      if (exerciseId !== "all") q = q.eq("exercise_id", exerciseId);
      return q.order("id").range(f, t);
    }
  );
  const names = await profileNames(supabase, targets);

  const byAthleteEx: Record<string, MaxRow> = {};
  for (const m of [...maxes].sort((a, b) => a.date_recorded.localeCompare(b.date_recorded))) {
    const row = (byAthleteEx[`${m.athlete_id}|${m.exercise_id}`] ??= {
      athleteId: m.athlete_id,
      athleteName: names[m.athlete_id] ?? "Unknown",
      exerciseId: m.exercise_id,
      exerciseName: m.exercises?.name ?? "Unknown",
      current: 0,
      unit: m.unit,
      history: [],
    });
    row.history.push({ date: m.date_recorded, value: Number(m.value) });
    row.current = Number(m.value);
  }

  return Object.values(byAthleteEx).sort((a, b) => b.current - a.current);
}
