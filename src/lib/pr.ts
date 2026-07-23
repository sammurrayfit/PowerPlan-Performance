import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * If `value` is a new all-time best for athlete+exercise, insert a PR record.
 * Must be called server-side with a Supabase client that has the right auth context.
 */
export const UNITS = ["lbs", "kg", "seconds", "meters"] as const;
export type Unit = typeof UNITS[number];

// Epley estimated 1RM — converts a multi-rep lift to a comparable 1RM value
export function epley1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export async function autoRecordPR(
  supabase: SupabaseClient,
  athleteId: string,
  exerciseId: string,
  value: number,
  unit: Unit,
  dateAchieved: string
) {
  const { data: existing } = await supabase
    .from("personal_records")
    .select("value")
    .eq("athlete_id", athleteId)
    .eq("exercise_id", exerciseId)
    .order("value", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing || value > existing.value) {
    const { error } = await supabase.from("personal_records").insert({
      athlete_id: athleteId,
      exercise_id: exerciseId,
      value,
      unit,
      date_achieved: dateAchieved,
    });
    if (error) throw new Error(error.message);
  }
}
