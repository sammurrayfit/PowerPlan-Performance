"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createCalendar(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = formData.get("name") as string;
  const color = formData.get("color") as string;
  const teamId = formData.get("team_id") as string | null;

  await supabase.from("calendars").insert({
    name,
    color: color || "#6366f1",
    coach_id: user.id,
    team_id: teamId || null,
  });

  revalidatePath("/coach/calendar");
}

export async function deleteCalendar(id: string) {
  const supabase = await createClient();
  await supabase.from("calendars").delete().eq("id", id);
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
  await supabase.from("workouts").update(updates).eq("id", id);
}

export async function deleteWorkout(id: string, calendarId: string) {
  const supabase = await createClient();
  await supabase.from("workouts").delete().eq("id", id);
  redirect(`/coach/calendar/${calendarId}`);
}
