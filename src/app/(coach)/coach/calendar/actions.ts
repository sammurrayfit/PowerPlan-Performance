"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";

export async function createCalendar(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = formData.get("name") as string;
  const color = formData.get("color") as string;
  const teamId = formData.get("team_id") as string | null;
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  await supabase.from("calendars").insert({
    name,
    color: color || "#32127A",
    coach_id: effectiveCoachId,
    team_id: teamId || null,
  });

  revalidatePath("/coach/calendar");
}

export async function deleteCalendar(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  await supabase.from("calendars").delete().eq("id", id).eq("coach_id", effectiveCoachId);
  revalidatePath("/coach/calendar");
}

export async function createWorkout(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const calendarId = formData.get("calendar_id") as string;
  const date = formData.get("date") as string;
  const title = formData.get("title") as string;
  const notes = (formData.get("notes") as string) || null;

  const { data: workout } = await supabase
    .from("workouts")
    .insert({ calendar_id: calendarId, date, title, notes })
    .select("id")
    .single();

  if (!workout) throw new Error("Failed to create workout");

  redirect(`/coach/calendar/${calendarId}/workout/${workout.id}`);
}

export async function updateWorkout(id: string, updates: { title?: string; notes?: string | null; is_locked?: boolean }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  const { data: calendars } = await supabase.from("calendars").select("id").eq("coach_id", effectiveCoachId);
  const calIds = (calendars ?? []).map((c) => c.id);
  if (calIds.length === 0) throw new Error("Not authorized");
  await supabase.from("workouts").update(updates).eq("id", id).in("calendar_id", calIds);
}

export async function deleteWorkout(id: string, calendarId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  const { data: cal } = await supabase.from("calendars").select("coach_id").eq("id", calendarId).single();
  if (!cal || cal.coach_id !== effectiveCoachId) throw new Error("Not authorized");
  await supabase.from("workouts").delete().eq("id", id).eq("calendar_id", calendarId);
  redirect(`/coach/calendar/${calendarId}`);
}

export interface CopyTargetCalendar {
  id: string;
  label: string;
  team: string | null;
}

// Every calendar the coach can copy into: team calendars plus athletes' personal
// calendars (labelled with the athlete's name, since many share a calendar name).
export async function listCopyTargetCalendars(): Promise<CopyTargetCalendar[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  const [{ data: calendars }, { data: teams }] = await Promise.all([
    supabase.from("calendars").select("id, name, team_id, athlete_id").eq("coach_id", effectiveCoachId),
    supabase.from("teams").select("id, name").eq("coach_id", effectiveCoachId),
  ]);
  const cals = calendars ?? [];
  const teamName = Object.fromEntries((teams ?? []).map((t) => [t.id, t.name]));

  const athleteIds = [...new Set(cals.map((c) => c.athlete_id).filter(Boolean))] as string[];
  const athleteName: Record<string, string> = {};
  const athleteTeam: Record<string, string> = {};
  if (athleteIds.length) {
    const [{ data: profiles }, { data: memberships }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", athleteIds),
      supabase.from("team_memberships").select("athlete_id, team_id").in("athlete_id", athleteIds),
    ]);
    for (const p of profiles ?? []) athleteName[p.id] = p.full_name;
    for (const m of memberships ?? []) if (teamName[m.team_id]) athleteTeam[m.athlete_id] = teamName[m.team_id];
  }

  return cals
    .map((c) => ({
      id: c.id,
      label: c.athlete_id ? `${athleteName[c.athlete_id] ?? "Unknown athlete"} — ${c.name}` : c.name,
      team: c.athlete_id ? athleteTeam[c.athlete_id] ?? null : (c.team_id ? teamName[c.team_id] ?? null : null),
    }))
    .sort((a, b) => (a.team ?? "~").localeCompare(b.team ?? "~") || a.label.localeCompare(b.label));
}

export async function copyWorkout(workoutId: string, targetDates: string[], replace = false, targetCalendarIds?: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  const [{ data: workout }, { data: workoutExercises }] = await Promise.all([
    supabase.from("workouts").select("calendar_id, title, notes").eq("id", workoutId).single(),
    supabase.from("workout_exercises").select("*").eq("workout_id", workoutId).order("sort_order"),
  ]);

  if (!workout) return;

  const calendarIds = targetCalendarIds?.length ? [...new Set(targetCalendarIds)] : [workout.calendar_id];
  const { data: owned } = await supabase
    .from("calendars")
    .select("id")
    .eq("coach_id", effectiveCoachId)
    .in("id", [...calendarIds, workout.calendar_id]);
  const ownedIds = new Set((owned ?? []).map((c) => c.id));
  if (!ownedIds.has(workout.calendar_id) || calendarIds.some((id) => !ownedIds.has(id))) {
    throw new Error("Not authorized");
  }

  for (const calendarId of calendarIds) {
    for (const date of targetDates) {
      if (replace) {
        // Delete any existing workouts on the same calendar+date (cascades to exercises via FK)
        const { data: existing } = await supabase
          .from("workouts")
          .select("id")
          .eq("calendar_id", calendarId)
          .eq("date", date);
        if (existing?.length) {
          await supabase.from("workouts").delete().in("id", existing.map((w) => w.id));
        }
      }

      const { data: newWorkout, error: workoutErr } = await supabase
        .from("workouts")
        .insert({ calendar_id: calendarId, date, title: workout.title, notes: workout.notes })
        .select("id")
        .single();

      if (workoutErr || !newWorkout) throw new Error(workoutErr?.message ?? "Failed to copy workout");

      if (workoutExercises?.length) {
        const { error: exErr } = await supabase.from("workout_exercises").insert(
          workoutExercises.map((we) => ({
            workout_id: newWorkout.id,
            exercise_id: we.exercise_id,
            sort_order: we.sort_order,
            sets: we.sets,
            reps: we.reps,
            load: we.load,
            load_type: we.load_type,
            tempo: we.tempo,
            rest_seconds: we.rest_seconds,
            notes: we.notes,
            is_pr_tracking: we.is_pr_tracking,
            superset_group: we.superset_group,
            is_pre_activation: we.is_pre_activation,
          }))
        );
        if (exErr) throw new Error(exErr.message);
      }
    }
    revalidatePath(`/coach/calendar/${calendarId}`);
  }
}

async function assertCoachOwnsWorkoutExercise(supabase: Awaited<ReturnType<typeof createClient>>, workoutExerciseId: string, coachId: string) {
  const { data } = await supabase
    .from("workout_exercises")
    .select("workouts(calendars(coach_id))")
    .eq("id", workoutExerciseId)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const owner = (data as any)?.workouts?.calendars?.coach_id;
  if (owner !== coachId) throw new Error("Not authorized");
}

export async function upsertOverride(
  workoutExerciseId: string,
  athleteId: string,
  data: {
    sets?: number | null;
    reps?: string | null;
    load?: number | null;
    load_type?: "absolute" | "percent_1rm" | "bodyweight" | null;
    notes?: string | null;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  await assertCoachOwnsWorkoutExercise(supabase, workoutExerciseId, effectiveCoachId);
  await supabase.from("athlete_exercise_overrides").upsert(
    { workout_exercise_id: workoutExerciseId, athlete_id: athleteId, ...data },
    { onConflict: "workout_exercise_id,athlete_id" }
  );
}

export async function deleteOverride(workoutExerciseId: string, athleteId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  await assertCoachOwnsWorkoutExercise(supabase, workoutExerciseId, effectiveCoachId);
  await supabase
    .from("athlete_exercise_overrides")
    .delete()
    .eq("workout_exercise_id", workoutExerciseId)
    .eq("athlete_id", athleteId);
}

interface SwapMatchParams {
  calendarId: string;
  fromExerciseId: string;
  startDate: string;
  endDate?: string | null;
  daysOfWeek?: number[];
}

interface SwapMatch {
  workoutExerciseId: string;
  workoutId: string;
  date: string;
  title: string;
}

// Shared by preview and apply so the two can never disagree about which
// workouts match — apply always re-derives matches server-side rather than
// trusting a client-supplied list of ids.
async function resolveSwapMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string,
  { calendarId, fromExerciseId, startDate, endDate, daysOfWeek }: SwapMatchParams
): Promise<SwapMatch[]> {
  const { data: calendar } = await supabase.from("calendars").select("coach_id").eq("id", calendarId).single();
  if (!calendar || calendar.coach_id !== coachId) throw new Error("Not authorized");

  let workoutQuery = supabase
    .from("workouts")
    .select("id, date, title")
    .eq("calendar_id", calendarId)
    .gte("date", startDate);
  if (endDate) workoutQuery = workoutQuery.lte("date", endDate);
  const { data: workouts } = await workoutQuery;

  const dayFilter = daysOfWeek && daysOfWeek.length > 0 ? new Set(daysOfWeek) : null;
  const matchingWorkouts = (workouts ?? []).filter((w) => {
    if (!dayFilter) return true;
    return dayFilter.has(new Date(w.date + "T00:00:00Z").getUTCDay());
  });
  if (matchingWorkouts.length === 0) return [];

  const workoutIds = matchingWorkouts.map((w) => w.id);
  const { data: rows } = await supabase
    .from("workout_exercises")
    .select("id, workout_id")
    .in("workout_id", workoutIds)
    .eq("exercise_id", fromExerciseId);

  const workoutById = Object.fromEntries(matchingWorkouts.map((w) => [w.id, w]));
  return (rows ?? [])
    .map((r) => {
      const w = workoutById[r.workout_id];
      return w ? { workoutExerciseId: r.id, workoutId: r.workout_id, date: w.date, title: w.title } : null;
    })
    .filter((r): r is SwapMatch => r !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function previewExerciseSwap(params: SwapMatchParams): Promise<{ matches: SwapMatch[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  const matches = await resolveSwapMatches(supabase, effectiveCoachId, params);
  return { matches };
}

export async function applyExerciseSwap(
  params: SwapMatchParams & { toExerciseId: string }
): Promise<{ updatedCount: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  const matches = await resolveSwapMatches(supabase, effectiveCoachId, params);
  if (matches.length === 0) return { updatedCount: 0 };

  const { error } = await supabase
    .from("workout_exercises")
    .update({ exercise_id: params.toExerciseId })
    .in("id", matches.map((m) => m.workoutExerciseId));
  if (error) throw new Error(error.message);

  revalidatePath(`/coach/calendar/${params.calendarId}`);
  return { updatedCount: matches.length };
}

export async function upsertAttendance(
  workoutId: string,
  athleteId: string,
  data: {
    status?: "present" | "absent" | "late";
    rpe_pre?: number | null;
    rpe_post?: number | null;
    notes?: string | null;
  }
) {
  const supabase = await createClient();
  await supabase
    .from("attendance")
    .upsert(
      { workout_id: workoutId, athlete_id: athleteId, ...data },
      { onConflict: "workout_id,athlete_id" }
    );
}
