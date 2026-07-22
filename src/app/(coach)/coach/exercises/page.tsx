import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId, getCoachGroupIds } from "@/lib/supabase/coach";
import { ExerciseLibrary } from "@/components/coach/exercises/exercise-library";

export default async function ExercisesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  const coachGroupIds = await getCoachGroupIds(supabase, effectiveCoachId);

  const [{ data: exercises }, { data: categories }] = await Promise.all([
    supabase
      .from("exercises")
      .select("*")
      .or(`created_by.in.(${coachGroupIds.join(",")}),is_public.eq.true`)
      .order("name"),
    supabase
      .from("exercise_categories")
      .select("*")
      .order("name"),
  ]);

  return (
    <ExerciseLibrary
      exercises={exercises ?? []}
      categories={categories ?? []}
      userId={user.id}
    />
  );
}
