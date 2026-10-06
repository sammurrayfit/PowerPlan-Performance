"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { compareWorkoutOrder } from "@/lib/utils";

export type WorkoutExportRow = {
  athleteName: string;
  date: string;
  calendarName: string;
  workoutTitle: string;
  attendance: string;
  rpePre: number | null;
  rpePost: number | null;
  order: number | null;
  exerciseName: string;
  sets: number | null;
  reps: string;
  load: string;
  targetLbs: number | null;
  tempo: string;
  restSeconds: number | null;
  coachNotes: string;
  setsLogged: number;
  loggedSets: string;
  topLoad: number | null;
  avgRpe: number | null;
  athleteNotes: string;
};

export type WorkoutExportResult =
  | { ok: true; rows: WorkoutExportRow[] }
  | { ok: false; error: string };

const CHUNK = 150;
const PAGE = 1000;

function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Supabase caps responses at 1000 rows and long `.in()` lists overflow the
// URL, so every multi-id read goes through here: ids are chunked and each
// chunk is paged until exhausted.
async function fetchAll<T>(
  ids: string[],
  query: (idChunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (const idChunk of chunk(ids)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await query(idChunk, from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

function formatLoad(load: number | null, loadType: string | null): string {
  if (loadType === "bodyweight") return "BW";
  if (load == null) return "";
  if (loadType === "percent_1rm") return `${load}%`;
  return `${load} lbs`;
}

function attendanceLabel(status: string | null | undefined): string {
  if (status === "present") return "Present";
  if (status === "late") return "Late";
  if (status === "absent") return "Absent";
  return "";
}

export async function fetchWorkoutExport(
  athleteIds: string[],
  startDate: string,
  endDate: string
): Promise<WorkoutExportResult> {
  if (athleteIds.length === 0) return { ok: false, error: "Select at least one athlete." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { ok: false, error: "Choose a start and end date." };
  }
  if (startDate > endDate) return { ok: false, error: "Start date must be before end date." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  try {
    // ── Which calendars apply to which athletes ─────────────────────────────
    // Same rule as the athlete profile: a team calendar applies to every
    // member of that team, an individual calendar to its one athlete.
    const [{ data: calendars }, memberships, { data: profiles }] = await Promise.all([
      supabase.from("calendars").select("id, name, team_id, athlete_id").eq("coach_id", effectiveCoachId),
      fetchAll(athleteIds, (ids, from, to) =>
        supabase.from("team_memberships").select("team_id, athlete_id").in("athlete_id", ids).range(from, to)
      ),
      supabase.from("profiles").select("id, full_name").in("id", athleteIds),
    ]);

    const selected = new Set(athleteIds);
    const nameById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

    const athletesByTeam: Record<string, string[]> = {};
    for (const m of memberships) (athletesByTeam[m.team_id] ??= []).push(m.athlete_id);

    const athletesByCalendar: Record<string, string[]> = {};
    const calNameById: Record<string, string> = {};
    for (const c of calendars ?? []) {
      calNameById[c.id] = c.name;
      const ids = c.athlete_id ? [c.athlete_id] : c.team_id ? athletesByTeam[c.team_id] ?? [] : [];
      const relevant = [...new Set(ids)].filter((id) => selected.has(id));
      if (relevant.length > 0) athletesByCalendar[c.id] = relevant;
    }

    const calIds = Object.keys(athletesByCalendar);
    if (calIds.length === 0) return { ok: true, rows: [] };

    // ── Workouts + their exercises ──────────────────────────────────────────
    const workouts = await fetchAll(calIds, (ids, from, to) =>
      supabase
        .from("workouts")
        .select("id, calendar_id, date, title")
        .in("calendar_id", ids)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date")
        .order("id")
        .range(from, to)
    );
    if (workouts.length === 0) return { ok: true, rows: [] };
    const workoutIds = workouts.map((w) => w.id);

    const [workoutExercises, attendance, logs, maxes] = await Promise.all([
      fetchAll(workoutIds, (ids, from, to) =>
        supabase
          .from("workout_exercises")
          .select("id, workout_id, exercise_id, sort_order, sets, reps, load, load_type, tempo, rest_seconds, notes, is_pre_activation, exercises(name)")
          .in("workout_id", ids)
          .order("id")
          .range(from, to)
      ),
      fetchAll(workoutIds, (ids, from, to) =>
        supabase
          .from("attendance")
          .select("workout_id, athlete_id, status, rpe_pre, rpe_post")
          .in("workout_id", ids)
          .in("athlete_id", athleteIds)
          .order("id")
          .range(from, to)
      ),
      fetchAll(workoutIds, (ids, from, to) =>
        supabase
          .from("exercise_logs")
          .select("workout_exercise_id, athlete_id, set_number, reps_completed, load_completed, rpe, notes")
          .in("workout_id", ids)
          .in("athlete_id", athleteIds)
          .order("id")
          .range(from, to)
      ),
      fetchAll(athleteIds, (ids, from, to) =>
        supabase
          .from("maxes")
          .select("athlete_id, exercise_id, value, date_recorded")
          .in("athlete_id", ids)
          .order("date_recorded")
          .order("id")
          .range(from, to)
      ),
    ]);

    const weIds = workoutExercises.map((we) => we.id);
    const overrides = weIds.length > 0
      ? await fetchAll(weIds, (ids, from, to) =>
          supabase
            .from("athlete_exercise_overrides")
            .select("workout_exercise_id, athlete_id, sets, reps, load, load_type, notes")
            .in("workout_exercise_id", ids)
            .in("athlete_id", athleteIds)
            .order("id")
            .range(from, to)
        )
      : [];

    // ── Index everything by key ─────────────────────────────────────────────
    const exByWorkout: Record<string, typeof workoutExercises> = {};
    for (const we of workoutExercises) (exByWorkout[we.workout_id] ??= []).push(we);
    for (const list of Object.values(exByWorkout)) list.sort((a, b) => a.sort_order - b.sort_order);

    const attendanceByKey = Object.fromEntries(attendance.map((a) => [`${a.workout_id}|${a.athlete_id}`, a]));
    const overrideByKey = Object.fromEntries(overrides.map((o) => [`${o.workout_exercise_id}|${o.athlete_id}`, o]));

    const logsByKey: Record<string, typeof logs> = {};
    for (const l of logs) (logsByKey[`${l.workout_exercise_id}|${l.athlete_id}`] ??= []).push(l);

    // Maxes are ascending by date, so each list's tail is the most recent.
    const maxesByKey: Record<string, { value: number; date: string }[]> = {};
    for (const m of maxes) {
      (maxesByKey[`${m.athlete_id}|${m.exercise_id}`] ??= []).push({ value: Number(m.value), date: m.date_recorded });
    }
    // %1RM loads resolve against the max in effect on the workout's date;
    // workouts before the first recorded max fall back to the earliest one.
    function maxAsOf(athleteId: string, exerciseId: string, date: string): number | null {
      const list = maxesByKey[`${athleteId}|${exerciseId}`];
      if (!list || list.length === 0) return null;
      let found = list[0].value;
      for (const m of list) {
        if (m.date <= date) found = m.value;
        else break;
      }
      return found;
    }

    // ── Build rows: one per athlete × workout × exercise ────────────────────
    const rows: WorkoutExportRow[] = [];
    const sortedWorkouts = workouts
      .map((w) => ({ ...w, calendarName: calNameById[w.calendar_id] ?? "" }))
      .sort(compareWorkoutOrder);

    for (const w of sortedWorkouts) {
      for (const aid of athletesByCalendar[w.calendar_id] ?? []) {
        const att = attendanceByKey[`${w.id}|${aid}`];
        const base = {
          athleteName: nameById[aid] ?? "Unknown",
          date: w.date,
          calendarName: w.calendarName,
          workoutTitle: w.title,
          attendance: attendanceLabel(att?.status),
          rpePre: att?.rpe_pre ?? null,
          rpePost: att?.rpe_post ?? null,
        };

        const exercises = exByWorkout[w.id] ?? [];
        if (exercises.length === 0) {
          rows.push({
            ...base, order: null, exerciseName: "", sets: null, reps: "", load: "",
            targetLbs: null, tempo: "", restSeconds: null, coachNotes: "", setsLogged: 0, loggedSets: "",
            topLoad: null, avgRpe: null, athleteNotes: "",
          });
          continue;
        }

        exercises.forEach((we, idx) => {
          const ov = overrideByKey[`${we.id}|${aid}`];
          const sets = ov?.sets ?? we.sets;
          const reps = ov?.reps ?? we.reps ?? "";
          const load = ov?.load ?? we.load;
          const loadType = ov?.load_type ?? we.load_type;
          const max = loadType === "percent_1rm" && load != null ? maxAsOf(aid, we.exercise_id, w.date) : null;

          const setLogs = (logsByKey[`${we.id}|${aid}`] ?? []).sort((a, b) => a.set_number - b.set_number);
          const loads = setLogs.map((l) => l.load_completed).filter((v): v is number => v != null).map(Number);
          const rpes = setLogs.map((l) => l.rpe).filter((v): v is number => v != null);

          rows.push({
            ...base,
            order: idx + 1,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            exerciseName: `${(we.exercises as any)?.name ?? "Unknown"}${we.is_pre_activation ? " (Pre-Activation)" : ""}`,
            sets,
            reps,
            load: formatLoad(load, loadType),
            targetLbs: max != null && load != null ? Math.round((load / 100) * max) : loadType === "absolute" ? load : null,
            tempo: we.tempo ?? "",
            restSeconds: we.rest_seconds,
            coachNotes: [we.notes, ov?.notes].filter(Boolean).join(" — "),
            setsLogged: setLogs.length,
            loggedSets: setLogs
              .map((l) => {
                const lr = `${l.load_completed ?? "–"}×${l.reps_completed ?? "–"}`;
                return l.rpe != null ? `${lr} @${l.rpe}` : lr;
              })
              .join(", "),
            topLoad: loads.length > 0 ? Math.max(...loads) : null,
            avgRpe: rpes.length > 0 ? Math.round((rpes.reduce((s, r) => s + r, 0) / rpes.length) * 10) / 10 : null,
            athleteNotes: setLogs.map((l) => l.notes).filter(Boolean).join(" | "),
          });
        });
      }
    }

    rows.sort((a, b) => a.athleteName.localeCompare(b.athleteName) || a.date.localeCompare(b.date));
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Export failed." };
  }
}
