import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Resolves a logged-in user's id to the id that actually owns their coaching
// data: their own id if they're a primary coach, or their primary coach's id
// if they're a co-coach. Mirrors the public.effective_coach_id() SQL
// function used by RLS policies — every coach_id read/write in app code
// should use this instead of the raw user id.
export async function getEffectiveCoachId(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("primary_coach_id").eq("id", userId).single();
  return data?.primary_coach_id ?? userId;
}

// All auth ids that share coach_id-scoped data with this coach: the primary
// coach's own id plus every co-coach attached to them. Rows like `exercises`
// keep `created_by` as the literal creator (not resolved to the primary), so
// membership queries against those need the full group, not just the primary id.
export async function getCoachGroupIds(supabase: SupabaseClient<Database>, effectiveCoachId: string): Promise<string[]> {
  const { data } = await supabase.from("profiles").select("id").eq("primary_coach_id", effectiveCoachId);
  return [effectiveCoachId, ...(data ?? []).map((p) => p.id)];
}
