"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function inviteAthlete(formData: FormData) {
  const email = formData.get("email") as string;
  const teamId = formData.get("team_id") as string;
  const fullName = formData.get("full_name") as string;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const admin = adminClient();

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role: "athlete", full_name: fullName },
    redirectTo: `${siteUrl}/invite/setup`,
  });

  if (error || !invited.user) throw new Error(error?.message ?? "Invite failed");

  // Explicitly create the profile — don't wait for the DB trigger
  await admin.from("profiles").upsert(
    { id: invited.user.id, full_name: fullName, role: "athlete" },
    { onConflict: "id" }
  );

  await admin.from("team_memberships").upsert(
    { team_id: teamId, athlete_id: invited.user.id },
    { onConflict: "team_id,athlete_id", ignoreDuplicates: true }
  );

  revalidatePath("/coach/athletes");
}

export async function removeAthleteFromTeam(athleteId: string, teamId: string) {
  const supabase = await createClient();
  await supabase
    .from("team_memberships")
    .delete()
    .eq("athlete_id", athleteId)
    .eq("team_id", teamId);
  revalidatePath("/coach/athletes");
}

export async function addMax(athleteId: string, exerciseId: string, value: number, dateRecorded: string) {
  const supabase = await createClient();
  await supabase.from("maxes").insert({
    athlete_id: athleteId,
    exercise_id: exerciseId,
    value,
    date_recorded: dateRecorded,
  });

  // Auto-record as PR if it's the best ever
  const { data: existingPr } = await supabase
    .from("personal_records")
    .select("value")
    .eq("athlete_id", athleteId)
    .eq("exercise_id", exerciseId)
    .order("value", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existingPr || value > existingPr.value) {
    await supabase.from("personal_records").insert({
      athlete_id: athleteId,
      exercise_id: exerciseId,
      value,
      unit: "lbs",
      date_achieved: dateRecorded,
    });
  }

  revalidatePath(`/coach/athletes/${athleteId}`);
}

export async function deleteMax(maxId: string, athleteId: string) {
  const supabase = await createClient();
  await supabase.from("maxes").delete().eq("id", maxId);
  revalidatePath(`/coach/athletes/${athleteId}`);
}

export async function createTeam(name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("teams")
    .insert({ name, coach_id: user.id })
    .select("id, name")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create team");
  revalidatePath("/coach/athletes");
  return data;
}

export async function sendPasswordReset(athleteId: string) {
  const admin = adminClient();
  const { data: userData } = await admin.auth.admin.getUserById(athleteId);
  if (!userData.user?.email) throw new Error("Athlete email not found");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: userData.user.email,
    options: { redirectTo: `${siteUrl}/invite/setup` },
  });
  if (error) throw new Error(error.message);
}

export async function assignCalendarToAthlete(calendarId: string, athleteId: string | null) {
  const supabase = await createClient();
  await supabase.from("calendars").update({ athlete_id: athleteId }).eq("id", calendarId);
}

export async function goToAthleteProfile(athleteId: string) {
  redirect(`/coach/athletes/${athleteId}`);
}
