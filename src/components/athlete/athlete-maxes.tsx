"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrendingUp, Trash2, ChevronDown, ChevronRight, Check } from "lucide-react";
import { addAthleteMax, deleteAthleteMax } from "@/app/(athlete)/athlete/prs/actions";
import { UNITS, type Unit } from "@/lib/pr";

interface Exercise {
  id: string;
  name: string;
}

interface MaxEntry {
  id: string;
  exercise_id: string;
  exerciseName: string;
  value: number;
  unit: string;
  date: string;
}

interface Props {
  currentMaxes: MaxEntry[];
  maxHistory: MaxEntry[];
  exercises: Exercise[];
}

export function AthleteMaxes({ currentMaxes, maxHistory, exercises }: Props) {
  // ── inline add state ─────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<Unit>("lbs");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const weightRef = useRef<HTMLInputElement>(null);

  // ── list state ───────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = search
    ? exercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  function pickExercise(ex: Exercise) {
    setSelected(ex);
    setSearch(ex.name);
    setTimeout(() => weightRef.current?.focus(), 0);
  }

  function reset() {
    setSelected(null);
    setSearch("");
    setWeight("");
    setSaved(false);
  }

  async function handleSave() {
    if (!selected || !weight) return;
    setSaving(true);
    await addAthleteMax(selected.id, Number(weight), new Date().toISOString().split("T")[0], unit);
    setSaving(false);
    setSaved(true);
    setTimeout(reset, 1000);
  }

  async function handleDelete(maxId: string) {
    if (!confirm("Delete this max entry?")) return;
    setDeleting(maxId);
    await deleteAthleteMax(maxId);
    setDeleting(null);
  }

  function toggleExpand(exerciseId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(exerciseId) ? next.delete(exerciseId) : next.add(exerciseId);
      return next;
    });
  }

  const historyByExercise: Record<string, MaxEntry[]> = {};
  for (const m of maxHistory) {
    if (!historyByExercise[m.exercise_id]) historyByExercise[m.exercise_id] = [];
    historyByExercise[m.exercise_id].push(m);
  }

  return (
    <section className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-blue-500" />
        <h2 className="text-sm font-semibold">1RM Maxes</h2>
      </div>

      {/* ── Inline quick-add ── */}
      <div className="space-y-1.5">
        <div className="flex gap-2">
          {/* Exercise search */}
          <div className="relative flex-1">
            <Input
              placeholder="Search exercises…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (selected && e.target.value !== selected.name) setSelected(null);
                setSaved(false);
              }}
              className="h-9 text-sm"
            />
            {/* Dropdown */}
            {filtered.length > 0 && !selected && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-md border bg-background shadow-md z-10 overflow-hidden">
                {filtered.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onMouseDown={() => pickExercise(ex)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    {ex.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Weight input */}
          <Input
            ref={weightRef}
            type="number"
            min="0"
            step="0.5"
            placeholder="value"
            value={weight}
            onChange={(e) => { setWeight(e.target.value); setSaved(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            className="h-9 text-sm w-20"
            disabled={!selected}
          />

          {/* Unit selector */}
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as Unit)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
            disabled={!selected}
          >
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>

          {/* Save button */}
          <Button
            size="sm"
            className="h-9 px-3 shrink-0"
            disabled={!selected || !weight || saving}
            onClick={handleSave}
          >
            {saved ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : saving ? (
              "…"
            ) : (
              "Save"
            )}
          </Button>
        </div>

        {selected && (
          <p className="text-xs text-muted-foreground px-1">
            {selected.name} selected ·{" "}
            <button onClick={reset} className="underline underline-offset-2 hover:text-foreground">
              clear
            </button>
          </p>
        )}
      </div>

      {/* ── Existing maxes list ── */}
      {currentMaxes.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1">No maxes recorded yet.</p>
      ) : (
        <div className="rounded-lg border divide-y overflow-hidden">
          {currentMaxes.map((m) => {
            const history = historyByExercise[m.exercise_id] ?? [];
            const isExpanded = expanded.has(m.exercise_id);
            const extraCount = history.length - 1;

            return (
              <div key={m.exercise_id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.exerciseName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.date + "T00:00:00").toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold tabular-nums">
                      {m.value} {m.unit}
                    </span>
                    {extraCount > 0 && (
                      <button
                        onClick={() => toggleExpand(m.exercise_id)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3 w-3" />
                          : <ChevronRight className="h-3 w-3" />}
                        {extraCount}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deleting === m.id}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t bg-muted/20 divide-y">
                    {history.slice(1).map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground"
                      >
                        <span>
                          {new Date(h.date + "T00:00:00").toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums">{h.value} {h.unit}</span>
                          <button
                            onClick={() => handleDelete(h.id)}
                            disabled={deleting === h.id}
                            className="hover:text-destructive transition-colors"
                          >
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
    </section>
  );
}
