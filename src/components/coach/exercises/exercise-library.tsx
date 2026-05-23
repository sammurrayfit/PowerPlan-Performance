"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ExerciseCard } from "./exercise-card";
import { ExerciseForm } from "./exercise-form";
import { Search, Plus, Dumbbell } from "lucide-react";
import type { Database } from "@/lib/supabase/types";

type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
type Category = Database["public"]["Tables"]["exercise_categories"]["Row"];

interface ExerciseLibraryProps {
  exercises: Exercise[];
  categories: Category[];
  userId: string;
}

const MUSCLE_GROUPS = [
  "Chest",
  "Anterior Deltoid", "Middle Deltoid", "Posterior Deltoid",
  "Triceps", "Biceps", "Forearms",
  "Back", "Latissimus Dorsi", "Trapezius", "Neck",
  "Quads", "Hamstrings", "Glutes", "Adductors", "Abductors", "Calves", "Anterior Tibialis",
  "Rectus Abdominis", "Lower Core", "Obliques", "Lower Back",
  "Full Body",
];

export function ExerciseLibrary({ exercises, categories, userId }: ExerciseLibraryProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeMuscle, setActiveMuscle] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = exercises.filter((ex) => {
    const matchesSearch =
      !search ||
      ex.name.toLowerCase().includes(search.toLowerCase()) ||
      ex.muscle_groups.some((m) => m.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = !activeCategory || ex.category_id === activeCategory;
    const matchesMuscle = !activeMuscle || ex.muscle_groups.includes(activeMuscle);
    return matchesSearch && matchesCategory && matchesMuscle;
  });

  // Only show categories that have exercises
  const usedCategoryIds = new Set(exercises.map((e) => e.category_id).filter(Boolean));
  const activeCategories = categories.filter((c) => usedCategoryIds.has(c.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exercise Library</h1>
          <p className="text-muted-foreground text-sm">{exercises.length} exercises</p>
        </div>
        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetTrigger render={<Button />}>
            <Plus className="h-4 w-4 mr-2" />
            New exercise
          </SheetTrigger>
          <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>New exercise</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <ExerciseForm
                categories={categories}
                userId={userId}
                onSuccess={() => setCreateOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search exercises or muscle groups…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category filter */}
      {activeCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={activeCategory === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setActiveCategory(null)}
          >
            All
          </Badge>
          {activeCategories.map((c) => (
            <Badge
              key={c.id}
              variant={activeCategory === c.id ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setActiveCategory(activeCategory === c.id ? null : c.id)}
            >
              {c.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Muscle group filter */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Muscle group</p>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={activeMuscle === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setActiveMuscle(null)}
          >
            All
          </Badge>
          {MUSCLE_GROUPS.map((m) => (
            <Badge
              key={m}
              variant={activeMuscle === m ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setActiveMuscle(activeMuscle === m ? null : m)}
            >
              {m}
            </Badge>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              categories={categories}
              userId={userId}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <Dumbbell className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            {exercises.length === 0 ? "No exercises yet" : "No exercises match your search"}
          </p>
          {exercises.length === 0 && (
            <p className="text-sm mt-1">Click "New exercise" to add your first one.</p>
          )}
        </div>
      )}
    </div>
  );
}
