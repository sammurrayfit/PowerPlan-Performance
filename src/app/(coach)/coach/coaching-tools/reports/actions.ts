"use server";

import { createClient } from "@/lib/supabase/server";

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

// ── Shared: get coach's calendar IDs and athlete IDs ─────────────────────────

async function getCoachScope(coachId: string) {
  const supabase = await createClient();

  const { data: calendars } = await supabase
    .from("calendars")
    .select("id, team_id, athlete_id")
    .eq("coach_id", coachId);

  const calIds = (calendars ?? []).map((c) => c.id);
  const teamIds = (calendars ?? []).map((c) => c.team_id).filter(Boolean) as string[];
  const directIds = (calendars ?? []).map((c) => c.athlete_id).filter(Boolean) as string[];

  const { data: memberships } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("athlete_id").in("team_id", teamIds)
    : { data: [] };

  const athleteIds = [
    ...new Set([...(memberships ?? []).map((m) => m.athlete_id), ...directIds]),
  ];

  return { calIds, athleteIds };
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
  week: string; // "May 12"
  [athleteName: string]: number | string;
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

export type MaxPoint = {
  date: string;
  [athleteName: string]: number | string;
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

// ── 1. Attendance ─────────────────────────────────────────────────────────────

export async function fetchAttendanceReport(
  coachId: string,
  range: string,
  athleteId: string
): Promise<AttendanceRow[]> {
  const supabase = await createClient();
  const { start, end } = dateRangeBounds(range);
  const { calIds, athleteIds } = await getCoachScope(coachId);
  if (calIds.length === 0 || athleteIds.length === 0) return [];

  const targetAthletes = athleteId === "all" ? athleteIds : [athleteId];

  // Get workouts in range
  const { data: workouts } = await supabase
    .from("workouts")
    .select("id")
    .in("calendar_id", calIds)
    .gte("date", start)
    .lte("date", end);

  const workoutIds = (workouts ?? []).map((w) => w.id);
  if (workoutIds.length === 0) return [];

  const { data: attendance } = await supabase
    .from("attendance")
    .select("athlete_id, status")
    .in("workout_id", workoutIds)
    .in("athlete_id", targetAthletes);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", targetAthletes)
    .order("full_name");

  const counts: Record<string, { present: number; late: number; absent: number }> = {};
  for (const id of targetAthletes) counts[id] = { present: 0, late: 0, absent: 0 };
  for (const a of attendance ?? []) {
    if (a.status === "present") counts[a.athlete_id].present++;
    if (a.status === "late")    counts[a.athlete_id].late++;
    if (a.status === "absent")  counts[a.athlete_id].absent++;
  }

  return (profiles ?? []).map((p) => {
    const c = counts[p.id] ?? { present: 0, late: 0, absent: 0 };
    const total = c.present + c.late + c.absent;
    return {
      athleteId: p.id,
      athleteName: p.full_name,
      present: c.present,
      late: c.late,
      absent: c.absent,
      total,
      pct: total > 0 ? Math.round(((c.present + c.late) / total) * 100) : 0,
    };
  });
}

// ── 2. Volume ─────────────────────────────────────────────────────────────────

export async function fetchVolumeReport(
  coachId: string,
  range: string,
  athleteId: string
): Promise<{ weeks: VolumeWeek[]; rows: VolumeRow[]; athleteNames: string[] }> {
  const supabase = await createClient();
  const { start, end } = dateRangeBounds(range);
  const { calIds, athleteIds } = await getCoachScope(coachId);
  if (calIds.length === 0 || athleteIds.length === 0) return { weeks: [], rows: [], athleteNames: [] };

  const targetAthletes = athleteId === "all" ? athleteIds : [athleteId];

  const { data: workouts } = await supabase
    .from("workouts")
    .select("id, date")
    .in("calendar_id", calIds)
    .gte("date", start)
    .lte("date", end);

  const workoutIds = (workouts ?? []).map((w) => w.id);
  const dateByWorkout = Object.fromEntries((workouts ?? []).map((w) => [w.id, w.date]));
  if (workoutIds.length === 0) return { weeks: [], rows: [], athleteNames: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: logs } = await supabase
    .from("exercise_logs")
    .select("athlete_id, workout_id, workout_exercise_id, reps_completed, load_completed")
    .in("workout_id", workoutIds)
    .in("athlete_id", targetAthletes);

  const weIds = [...new Set((logs ?? []).map((l: any) => l.workout_exercise_id))];
  const { data: wes } = weIds.length > 0
    ? await supabase.from("workout_exercises").select("id, exercise_id, exercises(name)").in("id", weIds)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weMap: Record<string, string> = Object.fromEntries((wes ?? []).map((we: any) => [we.id, (we.exercises as any)?.name ?? "Unknown"]));

  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", targetAthletes).order("full_name");
  const nameMap: Record<string, string> = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));
  const athleteNames = (profiles ?? []).map((p) => p.full_name);

  // Weekly aggregation for chart
  function weekLabel(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((day + 6) % 7));
    return mon.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const weekMap: Record<string, Record<string, number>> = {};
  const rowAccum: Record<string, Record<string, { sets: number; reps: number; vol: number }>> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of logs ?? [] as any[]) {
    const date = dateByWorkout[l.workout_id] ?? "";
    const week = weekLabel(date);
    const name = nameMap[l.athlete_id] ?? l.athlete_id;
    const exName = weMap[l.workout_exercise_id] ?? "Unknown";
    const vol = (l.reps_completed ?? 0) * (l.load_completed ?? 0);

    if (!weekMap[week]) weekMap[week] = {};
    weekMap[week][name] = (weekMap[week][name] ?? 0) + vol;

    const rkey = `${l.athlete_id}__${l.workout_exercise_id}`;
    if (!rowAccum[rkey]) rowAccum[rkey] = {};
    if (!rowAccum[rkey][exName]) rowAccum[rkey][exName] = { sets: 0, reps: 0, vol: 0 };
    rowAccum[rkey][exName].sets++;
    rowAccum[rkey][exName].reps += l.reps_completed ?? 0;
    rowAccum[rkey][exName].vol  += vol;
  }

  // Sort weeks chronologically
  const weeks: VolumeWeek[] = Object.entries(weekMap)
    .sort(([a], [b]) => new Date("2020 " + a).getTime() - new Date("2020 " + b).getTime())
    .map(([week, byAthlete]) => ({ week, ...byAthlete }));

  const rows: VolumeRow[] = [];
  for (const [rkey, exMap] of Object.entries(rowAccum)) {
    const [athleteId] = rkey.split("__");
    for (const [exName, agg] of Object.entries(exMap)) {
      rows.push({
        athleteId,
        athleteName: nameMap[athleteId] ?? athleteId,
        exerciseName: exName,
        totalSets: agg.sets,
        totalReps: agg.reps,
        totalVolume: agg.vol,
      });
    }
  }
  rows.sort((a, b) => b.totalVolume - a.totalVolume);

  return { weeks, rows, athleteNames };
}

// ── 3. PR History ─────────────────────────────────────────────────────────────

export async function fetchPRReport(
  coachId: string,
  range: string,
  athleteId: string
): Promise<{ rows: PRRow[]; chartData: { date: string; [athlete: string]: number | string }[] }> {
  const supabase = await createClient();
  const { start, end } = dateRangeBounds(range);
  const { athleteIds } = await getCoachScope(coachId);
  if (athleteIds.length === 0) return { rows: [], chartData: [] };

  const targetAthletes = athleteId === "all" ? athleteIds : [athleteId];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prs } = await supabase
    .from("personal_records")
    .select("id, athlete_id, exercise_id, value, unit, date_achieved, exercises(name)")
    .in("athlete_id", targetAthletes)
    .gte("date_achieved", start)
    .lte("date_achieved", end)
    .order("date_achieved", { ascending: false });

  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", targetAthletes);
  const nameMap: Record<string, string> = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: PRRow[] = (prs ?? [] as any[]).map((pr: any) => ({
    date: pr.date_achieved,
    athleteId: pr.athlete_id,
    athleteName: nameMap[pr.athlete_id] ?? pr.athlete_id,
    exerciseId: pr.exercise_id,
    exerciseName: (pr.exercises as any)?.name ?? "Unknown",
    value: Number(pr.value),
    unit: pr.unit,
  }));

  // For scatter chart: one point per PR
  const chartData = rows.map((r) => ({
    date: r.date,
    [r.athleteName]: r.value,
    exercise: r.exerciseName,
    athlete: r.athleteName,
    value: r.value,
    unit: r.unit,
  }));

  return { rows, chartData };
}

// ── 4. RPE Trends ────────────────────────────────────────────────────────────

export type RPERow = {
  date: string;
  athleteId: string;
  athleteName: string;
  rpe_pre: number | null;
  rpe_post: number | null;
  workoutTitle: string;
};

export type RPEPoint = {
  date: string;
  [key: string]: number | string | null;
};

export async function fetchRPEReport(
  coachId: string,
  range: string,
  athleteId: string
): Promise<{ rows: RPERow[]; prePoints: RPEPoint[]; postPoints: RPEPoint[] }> {
  const supabase = await createClient();
  const { start, end } = dateRangeBounds(range);
  const { calIds, athleteIds } = await getCoachScope(coachId);
  if (calIds.length === 0 || athleteIds.length === 0) return { rows: [], prePoints: [], postPoints: [] };

  const targetAthletes = athleteId === "all" ? athleteIds : [athleteId];

  const { data: workouts } = await supabase
    .from("workouts")
    .select("id, date, title")
    .in("calendar_id", calIds)
    .gte("date", start)
    .lte("date", end);

  const workoutIds = (workouts ?? []).map((w) => w.id);
  if (workoutIds.length === 0) return { rows: [], prePoints: [], postPoints: [] };

  const workoutMeta = Object.fromEntries((workouts ?? []).map((w) => [w.id, { date: w.date, title: w.title }]));

  const { data: attendance } = await supabase
    .from("attendance")
    .select("athlete_id, workout_id, rpe_pre, rpe_post")
    .in("workout_id", workoutIds)
    .in("athlete_id", targetAthletes)
    .not("rpe_pre", "is", null);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", targetAthletes)
    .order("full_name");

  const nameMap: Record<string, string> = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  // Build rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: RPERow[] = (attendance ?? [] as any[])
    .map((a: any) => ({
      date: workoutMeta[a.workout_id]?.date ?? "",
      athleteId: a.athlete_id,
      athleteName: nameMap[a.athlete_id] ?? a.athlete_id,
      rpe_pre: a.rpe_pre,
      rpe_post: a.rpe_post,
      workoutTitle: workoutMeta[a.workout_id]?.title ?? "",
    }))
    .filter((r) => r.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Build chart points keyed by date — one per-athlete value
  const preMap: Record<string, Record<string, number>> = {};
  const postMap: Record<string, Record<string, number>> = {};

  for (const r of rows) {
    const name = r.athleteName;
    if (!preMap[r.date]) preMap[r.date] = {};
    if (!postMap[r.date]) postMap[r.date] = {};
    if (r.rpe_pre != null) preMap[r.date][name] = r.rpe_pre;
    if (r.rpe_post != null) postMap[r.date][name] = r.rpe_post;
  }

  const allDates = [...new Set([...Object.keys(preMap), ...Object.keys(postMap)])].sort();

  const prePoints: RPEPoint[] = allDates.map((d) => ({ date: d, ...(preMap[d] ?? {}) }));
  const postPoints: RPEPoint[] = allDates.map((d) => ({ date: d, ...(postMap[d] ?? {}) }));

  return { rows, prePoints, postPoints };
}

// ── 5. Max Progression ────────────────────────────────────────────────────────

export async function fetchMaxProgressionReport(
  coachId: string,
  athleteId: string,
  exerciseId: string
): Promise<{ points: MaxPoint[]; rows: MaxRow[]; exerciseIds: string[] }> {
  const supabase = await createClient();
  const { athleteIds } = await getCoachScope(coachId);
  if (athleteIds.length === 0) return { points: [], rows: [], exerciseIds: [] };

  const targetAthletes = athleteId === "all" ? athleteIds : [athleteId];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = supabase
    .from("maxes")
    .select("athlete_id, exercise_id, value, unit, date_recorded, exercises(name)")
    .in("athlete_id", targetAthletes)
    .order("date_recorded", { ascending: true });

  const { data: maxes } = exerciseId !== "all"
    ? await query.eq("exercise_id", exerciseId)
    : await query;

  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", targetAthletes);
  const nameMap: Record<string, string> = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  const exerciseIds = [...new Set((maxes ?? []).map((m: any) => m.exercise_id))];

  // Line chart: one point per date, value per athlete
  const dateAthleteMap: Record<string, Record<string, number>> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of maxes ?? [] as any[]) {
    const name = nameMap[m.athlete_id] ?? m.athlete_id;
    if (!dateAthleteMap[m.date_recorded]) dateAthleteMap[m.date_recorded] = {};
    dateAthleteMap[m.date_recorded][name] = Number(m.value);
  }
  const points: MaxPoint[] = Object.entries(dateAthleteMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));

  // Table rows: per athlete per exercise, latest + history
  const byAthleteEx: Record<string, { dates: string[]; vals: number[]; unit: string; exName: string; exId: string }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of maxes ?? [] as any[]) {
    const key = `${m.athlete_id}__${m.exercise_id}`;
    if (!byAthleteEx[key]) {
      byAthleteEx[key] = { dates: [], vals: [], unit: m.unit, exName: (m.exercises as any)?.name ?? "Unknown", exId: m.exercise_id };
    }
    byAthleteEx[key].dates.push(m.date_recorded);
    byAthleteEx[key].vals.push(Number(m.value));
  }

  const rows: MaxRow[] = Object.entries(byAthleteEx).map(([key, data]) => {
    const [aId] = key.split("__");
    const latest = data.vals[data.vals.length - 1];
    return {
      athleteId: aId,
      athleteName: nameMap[aId] ?? aId,
      exerciseId: data.exId,
      exerciseName: data.exName,
      current: latest,
      unit: data.unit,
      history: data.dates.map((d, i) => ({ date: d, value: data.vals[i] })),
    };
  });
  rows.sort((a, b) => b.current - a.current);

  return { points, rows, exerciseIds };
}
