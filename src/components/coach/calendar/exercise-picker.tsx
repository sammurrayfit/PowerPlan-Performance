"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface Exercise {
  id: string;
  name: string;
  muscle_groups: string[];
}

interface ExercisePickerProps {
  exercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
}

export function ExercisePicker({ exercises, onSelect }: ExercisePickerProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return exercises.slice(0, 50);
    const q = search.toLowerCase();
    return exercises
      .filter((e) => e.name.toLowerCase().includes(q) || e.muscle_groups.some((m) => m.toLowerCase().includes(q)))
      .slice(0, 50);
  }, [exercises, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Search exercises…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {filtered.map((ex) => (
          <button
            key={ex.id}
            onClick={() => onSelect(ex)}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors"
          >
            <p className="text-sm font-medium">{ex.name}</p>
            {ex.muscle_groups.length > 0 && (
              <p className="text-xs text-muted-foreground">{ex.muscle_groups.slice(0, 3).join(", ")}</p>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No exercises found</p>
        )}
      </div>
    </div>
  );
}
