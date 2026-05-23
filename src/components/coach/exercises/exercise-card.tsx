"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ExerciseForm } from "./exercise-form";
import { Pencil, Trash2, Video, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";

type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
type Category = Database["public"]["Tables"]["exercise_categories"]["Row"];

interface ExerciseCardProps {
  exercise: Exercise;
  categories: Category[];
  userId: string;
}

export function ExerciseCard({ exercise, categories, userId }: ExerciseCardProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const category = categories.find((c) => c.id === exercise.category_id);

  async function handleDelete() {
    if (!confirm(`Delete "${exercise.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("exercises").delete().eq("id", exercise.id);
    if (error) {
      toast.error(error.message);
      setDeleting(false);
    } else {
      toast.success("Exercise deleted");
      router.refresh();
    }
  }

  return (
    <>
      <Card className="group hover:shadow-md transition-shadow">
        {/* Media thumbnail */}
        {exercise.video_url ? (
          <div className="relative aspect-video bg-muted rounded-t-lg overflow-hidden">
            <video src={exercise.video_url} className="w-full h-full object-cover" muted />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Video className="h-8 w-8 text-white" />
            </div>
          </div>
        ) : exercise.image_url ? (
          <div className="aspect-video bg-muted rounded-t-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={exercise.image_url} alt={exercise.name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="aspect-video bg-muted rounded-t-lg flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        <CardHeader className="pb-2 pt-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-semibold leading-tight">{exercise.name}</CardTitle>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {category && <Badge variant="secondary" className="w-fit text-xs">{category.name}</Badge>}
        </CardHeader>

        {exercise.muscle_groups.length > 0 && (
          <CardContent className="pt-0 pb-3">
            <div className="flex flex-wrap gap-1">
              {exercise.muscle_groups.slice(0, 4).map((m) => (
                <span key={m} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {m}
                </span>
              ))}
              {exercise.muscle_groups.length > 4 && (
                <span className="text-xs text-muted-foreground">+{exercise.muscle_groups.length - 4}</span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit exercise</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ExerciseForm
              categories={categories}
              exercise={exercise}
              userId={userId}
              onSuccess={() => setEditOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
