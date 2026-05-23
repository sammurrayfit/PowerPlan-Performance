import { createClient } from "@/lib/supabase/server";
import { ExerciseLibrary } from "@/components/coach/exercises/exercise-library";

export default async function ExercisesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: exercises }, { data: categories }] = await Promise.all([
    supabase
      .from("exercises")
      .select("*")
      .or(`created_by.eq.${user.id},is_public.eq.true`)
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
