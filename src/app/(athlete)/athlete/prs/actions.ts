"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { autoRecordPR, type Unit } from "@/lib/pr";

export async function addAthleteMax(exerciseId: string, value: number, dateRecorded: string, unit: Unit = "lbs") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error: maxError } = await supabase.from("maxes").insert({
    athlete_id: user.id,
    exercise_id: exerciseId,
    value,
    unit,
    date_recorded: dateRecorded,
  });
  if (maxError) throw new Error(maxError.message);

  await autoRecordPR(supabase, user.id, exerciseId, value, unit, dateRecorded);

  revalidatePath("/athlete/prs");
}

export async function deleteAthleteMax(maxId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Verify ownership before deleting
  await supabase.from("maxes").delete().eq("id", maxId).eq("athlete_id", user.id);

  revalidatePath("/athlete/prs");
}
