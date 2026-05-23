"use client";

import { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Trophy } from "lucide-react";

interface MaxEntry {
  athlete_id: string;
  athlete_name: string;
  exercise_id: string;
  exercise_name: string;
  value: number;
  unit: string;
  date_recorded: string;
}

interface LeaderboardProps {
  allMaxes: MaxEntry[];
}

export function Leaderboard({ allMaxes }: LeaderboardProps) {
  const exercises = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of allMaxes) map.set(m.exercise_id, m.exercise_name);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allMaxes]);

  const [selectedExercise, setSelectedExercise] = useState(exercises[0]?.id ?? "");

  const ranked = useMemo(() => {
    // Latest max per athlete for selected exercise
    const best: Record<string, MaxEntry> = {};
    for (const m of allMaxes) {
      if (m.exercise_id !== selectedExercise) continue;
      const existing = best[m.athlete_id];
      if (!existing || new Date(m.date_recorded) > new Date(existing.date_recorded)) {
        best[m.athlete_id] = m;
      }
    }
    return Object.values(best).sort((a, b) => b.value - a.value);
  }, [allMaxes, selectedExercise]);

  if (exercises.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="font-medium">No maxes recorded yet</p>
        <p className="text-sm mt-1">Add maxes to athletes to see the leaderboard.</p>
      </div>
    );
  }

  const medalColors = ["text-yellow-500", "text-slate-400", "text-amber-600"];

  return (
    <div className="space-y-4">
      <div className="max-w-xs space-y-1.5">
        <Label>Exercise</Label>
        <select
          value={selectedExercise}
          onChange={(e) => setSelectedExercise(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
        </select>
      </div>

      {ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No maxes for this exercise.</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {ranked.map((entry, i) => (
            <div key={entry.athlete_id} className="flex items-center gap-4 px-4 py-3">
              <div className={`w-8 text-center font-bold text-sm ${i < 3 ? medalColors[i] : "text-muted-foreground"}`}>
                {i < 3 ? <Trophy className="h-4 w-4 mx-auto" /> : `#${i + 1}`}
              </div>
              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                {entry.athlete_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{entry.athlete_name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.date_recorded).toLocaleDateString()}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {entry.value} {entry.unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
