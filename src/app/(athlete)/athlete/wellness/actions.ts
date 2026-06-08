"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveCheckin(data: {
  date: string;
  energy_level: number;
  stress_level: number;
  motivation: number;
  sleep_hours: number | null;
  notes: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("mental_checkins")
    .upsert(
      { athlete_id: user.id, ...data },
      { onConflict: "athlete_id,date" }
    );
  if (error) throw new Error(error.message);
  revalidatePath("/athlete/wellness");
}

export async function saveNutrition(data: {
  date: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  notes: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("nutrition_logs")
    .upsert(
      { athlete_id: user.id, ...data },
      { onConflict: "athlete_id,date" }
    );
  if (error) throw new Error(error.message);
  revalidatePath("/athlete/wellness");
}
