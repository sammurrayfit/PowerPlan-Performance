"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { autoRecordPR, type Unit } from "@/lib/pr";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function createAthleteDirectly(formData: FormData) {
  const email = formData.get("email") as string;
  const teamId = formData.get("team_id") as string;
  const fullName = formData.get("full_name") as string;
  const password = formData.get("password") as string;

  const admin = adminClient();

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    user_metadata: { role: "athlete", full_name: fullName },
    email_confirm: true,
  });

  if (error || !created.user) throw new Error(error?.message ?? "Failed to create account");

  await admin.from("profiles").upsert(
    { id: created.user.id, full_name: fullName, role: "athlete" },
    { onConflict: "id" }
  );

  await admin.from("team_memberships").upsert(
    { team_id: teamId, athlete_id: created.user.id },
    { onConflict: "team_id,athlete_id", ignoreDuplicates: true }
  );

  revalidatePath("/coach/athletes");
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: team } = await supabase
    .from("teams")
    .select("coach_id")
    .eq("id", teamId)
    .single();
  if (!team || team.coach_id !== user.id) throw new Error("Not authorized");

  await supabase
    .from("team_memberships")
    .delete()
    .eq("athlete_id", athleteId)
    .eq("team_id", teamId);
  revalidatePath("/coach/athletes");
}

export async function addMax(athleteId: string, exerciseId: string, value: number, dateRecorded: string, unit: Unit = "lbs") {
  const supabase = await createClient();
  await supabase.from("maxes").insert({
    athlete_id: athleteId,
    exercise_id: exerciseId,
    value,
    unit,
    date_recorded: dateRecorded,
  });

  await autoRecordPR(supabase, athleteId, exerciseId, value, unit, dateRecorded);

  revalidatePath(`/coach/athletes/${athleteId}`);
}

export async function deleteMax(maxId: string, athleteId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: teams } = await supabase.from("teams").select("id").eq("coach_id", user.id);
  const teamIds = (teams ?? []).map((t) => t.id);
  const { data: membership } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("athlete_id").eq("athlete_id", athleteId).in("team_id", teamIds).maybeSingle()
    : { data: null };
  const { data: directCal } = await supabase.from("calendars").select("id").eq("coach_id", user.id).eq("athlete_id", athleteId).maybeSingle();
  if (!membership && !directCal) throw new Error("Not authorized");
  await supabase.from("maxes").delete().eq("id", maxId).eq("athlete_id", athleteId);
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

// ── Bulk max import ───────────────────────────────────────────────────────────

export interface BulkMaxRow {
  athleteName: string;
  exerciseName: string;
  value: number;       // already converted to estimated 1RM if reps > 1
  reps: number;
  date: string;
}

export interface BulkImportResult {
  inserted: number;
  skipped: { row: BulkMaxRow; reason: string }[];
}

export async function bulkImportMaxes(rows: BulkMaxRow[]): Promise<BulkImportResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Load all athletes under this coach
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("coach_id", user.id);
  const teamIds = (teams ?? []).map((t) => t.id);

  const { data: memberships } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("athlete_id").in("team_id", teamIds)
    : { data: [] };
  const athleteIds = [...new Set((memberships ?? []).map((m) => m.athlete_id))];

  const { data: profiles } = athleteIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", athleteIds)
    : { data: [] };

  // Case-insensitive athlete name → id
  const athleteMap: Record<string, string> = {};
  for (const p of profiles ?? []) {
    athleteMap[p.full_name.toLowerCase().trim()] = p.id;
  }

  // Load all exercises
  const { data: exercises } = await supabase.from("exercises").select("id, name");
  const exerciseMap: Record<string, string> = {};
  for (const e of exercises ?? []) {
    exerciseMap[e.name.toLowerCase().trim()] = e.id;
  }

  const skipped: BulkImportResult["skipped"] = [];
  let inserted = 0;

  for (const row of rows) {
    const athleteId = athleteMap[row.athleteName.toLowerCase().trim()];
    if (!athleteId) {
      skipped.push({ row, reason: `Athlete "${row.athleteName}" not found` });
      continue;
    }

    // Fuzzy exercise match: exact first, then startsWith, then includes
    const key = row.exerciseName.toLowerCase().trim();
    let exerciseId = exerciseMap[key];
    if (!exerciseId) {
      const match = Object.entries(exerciseMap).find(
        ([n]) => n.startsWith(key) || key.startsWith(n)
      );
      if (match) exerciseId = match[1];
    }
    if (!exerciseId) {
      skipped.push({ row, reason: `Exercise "${row.exerciseName}" not found` });
      continue;
    }

    await supabase.from("maxes").insert({
      athlete_id: athleteId,
      exercise_id: exerciseId,
      value: row.value,
      date_recorded: row.date,
    });

    await autoRecordPR(supabase, athleteId, exerciseId, row.value, "lbs", row.date);

    inserted++;
  }

  revalidatePath("/coach/athletes");
  return { inserted, skipped };
}
