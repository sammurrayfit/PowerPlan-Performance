"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { addMax, deleteMax } from "@/app/(coach)/coach/athletes/actions";
import { UNITS, epley1RM, type Unit } from "@/lib/pr";

interface Exercise {
  id: string;
  name: string;
}

interface Max {
  id: string;
  exercise_id: string;
  exercise_name: string;
  value: number;
  unit: string;
  date_recorded: string;
}

interface MaxesTableProps {
  athleteId: string;
  currentMaxes: Max[];
  maxHistory: Max[];
  exercises: Exercise[];
}

function AddMaxDialog({
  athleteId,
  exercises,
  onClose,
}: {
  athleteId: string;
  exercises: Exercise[];
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [value, setValue] = useState("");
  const [reps, setReps] = useState("1");
  const [unit, setUnit] = useState<Unit>("lbs");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const filtered = exercises
    .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20);

  const repsNum = Number(reps) || 1;
  const estimated1RM = value ? epley1RM(Number(value), repsNum) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedExercise || !value) return;
    setLoading(true);
    await addMax(athleteId, selectedExercise.id, epley1RM(Number(value), repsNum), date, unit);
    onClose();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-3 mt-2">
        <div className="space-y-1.5">
          <Label>Exercise</Label>
          {selectedExercise ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{selectedExercise.name}</span>
              <button type="button" onClick={() => setSelectedExercise(null)} className="text-muted-foreground hover:text-foreground text-xs">
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Search exercises…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {search && (
                <div className="rounded-md border max-h-40 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-3 py-2">No results</p>
                  ) : (
                    filtered.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => { setSelectedExercise(ex); setSearch(""); }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                      >
                        {ex.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Value</Label>
            <Input
              type="number"
              min="0"
              step="0.5"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 315"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reps</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
            >
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </div>
        {repsNum > 1 && estimated1RM != null && (
          <p className="text-xs text-muted-foreground">
            ≈ {estimated1RM} {unit} estimated 1RM (Epley formula)
          </p>
        )}
      </div>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={loading || !selectedExercise || !value}>
          {loading ? "Saving…" : "Save max"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MaxesTable({ athleteId, currentMaxes, maxHistory, exercises }: MaxesTableProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(exerciseId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(exerciseId) ? next.delete(exerciseId) : next.add(exerciseId);
      return next;
    });
  }

  // Group history by exercise_id
  const historyByExercise: Record<string, Max[]> = {};
  for (const m of maxHistory) {
    if (!historyByExercise[m.exercise_id]) historyByExercise[m.exercise_id] = [];
    historyByExercise[m.exercise_id].push(m);
  }

  async function handleDelete(maxId: string) {
    if (!confirm("Delete this max entry?")) return;
    await deleteMax(maxId, athleteId);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Maxes</h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add max
        </Button>
      </div>

      {currentMaxes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No maxes recorded yet.</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {currentMaxes.map((m) => {
            const history = historyByExercise[m.exercise_id] ?? [];
            const isExpanded = expanded.has(m.exercise_id);
            const extraCount = history.length - 1;

            return (
              <div key={m.exercise_id}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{m.exercise_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.date_recorded).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums">
                      {m.value} {m.unit}
                    </span>
                    {extraCount > 0 && (
                      <button
                        onClick={() => toggleExpand(m.exercise_id)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {extraCount} more
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t bg-muted/20">
                    {history.slice(1).map((h) => (
                      <div key={h.id} className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground">
                        <span>{new Date(h.date_recorded).toLocaleDateString()}</span>
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums">{h.value} {h.unit}</span>
                          <button onClick={() => handleDelete(h.id)} className="hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add max</DialogTitle>
          </DialogHeader>
          <AddMaxDialog athleteId={athleteId} exercises={exercises} onClose={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
