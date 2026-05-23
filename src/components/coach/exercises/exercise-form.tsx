"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { MediaUpload } from "./media-upload";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";

type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
type Category = Database["public"]["Tables"]["exercise_categories"]["Row"];

const MUSCLE_GROUPS = [
  "Chest",
  "Anterior Deltoid", "Middle Deltoid", "Posterior Deltoid",
  "Triceps", "Biceps", "Forearms",
  "Back", "Latissimus Dorsi", "Trapezius", "Neck",
  "Quads", "Hamstrings", "Glutes", "Adductors", "Abductors", "Calves", "Anterior Tibialis",
  "Rectus Abdominis", "Lower Core", "Obliques", "Lower Back",
  "Full Body",
];

interface ExerciseFormProps {
  categories: Category[];
  exercise?: Exercise;
  userId: string;
  onSuccess?: () => void;
}

export function ExerciseForm({ categories, exercise, userId, onSuccess }: ExerciseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState(exercise?.name ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(exercise?.category_id ?? null);
  const [description, setDescription] = useState(exercise?.description ?? "");
  const [instructions, setInstructions] = useState(exercise?.instructions ?? "");
  const [videoUrl, setVideoUrl] = useState<string | null>(exercise?.video_url ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(exercise?.image_url ?? null);
  const [muscleGroups, setMuscleGroups] = useState<string[]>(exercise?.muscle_groups ?? []);

  function toggleMuscle(muscle: string) {
    setMuscleGroups((prev) =>
      prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Exercise name is required"); return; }

    setLoading(true);
    const supabase = createClient();

    const payload = {
      name: name.trim(),
      category_id: categoryId,
      description: description || null,
      instructions: instructions || null,
      video_url: videoUrl,
      image_url: imageUrl,
      muscle_groups: muscleGroups,
    };

    if (exercise) {
      const { error } = await supabase.from("exercises").update(payload).eq("id", exercise.id);
      if (error) { toast.error(error.message); setLoading(false); return; }
      toast.success("Exercise updated");
    } else {
      const { error } = await supabase.from("exercises").insert({ ...payload, created_by: userId });
      if (error) { toast.error(error.message); setLoading(false); return; }
      toast.success("Exercise created");
    }

    router.refresh();
    onSuccess?.();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Exercise name *</Label>
        <Input
          id="name"
          placeholder="e.g. Back Squat"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={categoryId} onValueChange={(v) => setCategoryId(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Muscle groups</Label>
        <div className="grid grid-cols-3 gap-2">
          {MUSCLE_GROUPS.map((muscle) => (
            <div key={muscle} className="flex items-center gap-2">
              <Checkbox
                id={muscle}
                checked={muscleGroups.includes(muscle)}
                onCheckedChange={() => toggleMuscle(muscle)}
              />
              <Label htmlFor={muscle} className="text-sm font-normal cursor-pointer">{muscle}</Label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Short description</Label>
        <Textarea
          id="description"
          placeholder="Brief summary of the exercise"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">Coaching cues / instructions</Label>
        <Textarea
          id="instructions"
          placeholder="Step-by-step instructions for athletes"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
        />
      </div>

      <MediaUpload type="video" currentUrl={videoUrl} onUpload={setVideoUrl} />
      <MediaUpload type="image" currentUrl={imageUrl} onUpload={setImageUrl} />

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving…" : exercise ? "Save changes" : "Create exercise"}
      </Button>
    </form>
  );
}
