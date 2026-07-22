import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { CoachList } from "@/components/coach/coaching-tools/coach-list";

export default async function CoachesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  if (effectiveCoachId !== user.id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", effectiveCoachId)
      .single();

    return (
      <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
        <p className="font-medium">You&apos;re a co-coach under {owner?.full_name ?? "another coach"}</p>
        <p className="text-sm mt-1">Only they can add or remove co-coaches.</p>
      </div>
    );
  }

  const { data: coaches } = await supabase
    .from("profiles")
    .select("id, full_name, created_at")
    .eq("primary_coach_id", effectiveCoachId)
    .order("full_name");

  return <CoachList coaches={coaches ?? []} />;
}
