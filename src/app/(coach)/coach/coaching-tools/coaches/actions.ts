"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Only a primary coach (not already a co-coach themselves) may manage
// co-coaches — prevents co-coaches from inviting further co-coaches.
async function assertIsPrimaryCoach(): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  if (effectiveCoachId !== user.id) throw new Error("Not authorized");
  return user;
}

export async function createCoachDirectly(formData: FormData) {
  const owner = await assertIsPrimaryCoach();

  const email = formData.get("email") as string;
  const fullName = formData.get("full_name") as string;
  const password = formData.get("password") as string;

  const admin = adminClient();

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    user_metadata: { role: "coach", full_name: fullName },
    email_confirm: true,
  });

  if (error || !created.user) throw new Error(error?.message ?? "Failed to create account");

  await admin.from("profiles").upsert(
    { id: created.user.id, full_name: fullName, role: "coach", primary_coach_id: owner.id },
    { onConflict: "id" }
  );

  revalidatePath("/coach/coaching-tools/coaches");
}

export async function inviteCoach(formData: FormData) {
  const owner = await assertIsPrimaryCoach();

  const email = formData.get("email") as string;
  const fullName = formData.get("full_name") as string;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const admin = adminClient();

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role: "coach", full_name: fullName },
    redirectTo: `${siteUrl}/invite/setup`,
  });

  if (error || !invited.user) throw new Error(error?.message ?? "Invite failed");

  await admin.from("profiles").upsert(
    { id: invited.user.id, full_name: fullName, role: "coach", primary_coach_id: owner.id },
    { onConflict: "id" }
  );

  revalidatePath("/coach/coaching-tools/coaches");
}

export async function removeCoach(coachId: string) {
  const owner = await assertIsPrimaryCoach();

  const admin = adminClient();
  const { data: coach } = await admin.from("profiles").select("primary_coach_id").eq("id", coachId).single();
  if (!coach || coach.primary_coach_id !== owner.id) throw new Error("Not authorized");

  await admin.from("profiles").update({ primary_coach_id: null }).eq("id", coachId);

  revalidatePath("/coach/coaching-tools/coaches");
}
