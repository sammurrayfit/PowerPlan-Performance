import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId, getCoachGroupIds } from "@/lib/supabase/coach";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ExerciseForm } from "@/components/coach/exercises/exercise-form";
import { Video } from "lucide-react";

export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);
  const coachGroupIds = await getCoachGroupIds(supabase, effectiveCoachId);

  const [{ data: exercise }, { data: categories }] = await Promise.all([
    supabase.from("exercises").select("*").eq("id", id).single(),
    supabase.from("exercise_categories").select("*").order("name"),
  ]);

  if (!exercise) notFound();

  const category = categories?.find((c) => c.id === exercise.category_id);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{exercise.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          {category && <Badge variant="secondary">{category.name}</Badge>}
          {exercise.muscle_groups.map((m) => (
            <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
          ))}
        </div>
      </div>

      {/* Media */}
      {exercise.video_url && (
        <div className="rounded-lg overflow-hidden border">
          <video src={exercise.video_url} controls className="w-full max-h-64 object-cover" />
        </div>
      )}
      {!exercise.video_url && exercise.image_url && (
        <div className="rounded-lg overflow-hidden border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={exercise.image_url} alt={exercise.name} className="w-full max-h-64 object-cover" />
        </div>
      )}

      {exercise.description && (
        <p className="text-muted-foreground">{exercise.description}</p>
      )}

      {exercise.instructions && (
        <div className="space-y-2">
          <h2 className="font-semibold">Instructions</h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{exercise.instructions}</p>
        </div>
      )}

      {exercise.created_by && coachGroupIds.includes(exercise.created_by) && (
        <div className="border-t pt-6">
          <h2 className="font-semibold mb-4">Edit exercise</h2>
          <ExerciseForm
            categories={categories ?? []}
            exercise={exercise}
            userId={user.id}
          />
        </div>
      )}
    </div>
  );
}
