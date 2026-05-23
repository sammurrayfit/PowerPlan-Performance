"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { upsertOverride, deleteOverride } from "@/app/(coach)/coach/calendar/actions";

interface WorkoutExercise {
  id: string;
  exercise_name: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  load_type: "absolute" | "percent_1rm" | "bodyweight";
}

interface Athlete {
  id: string;
  full_name: string;
}

interface Override {
  id: string;
  workout_exercise_id: string;
  athlete_id: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  load_type: "absolute" | "percent_1rm" | "bodyweight" | null;
  notes: string | null;
}

type OverrideMap = Record<string, Record<string, Override>>;

function buildOverrideMap(overrides: Override[]): OverrideMap {
  const map: OverrideMap = {};
  for (const o of overrides) {
    if (!map[o.workout_exercise_id]) map[o.workout_exercise_id] = {};
    map[o.workout_exercise_id][o.athlete_id] = o;
  }
  return map;
}

function baseLabel(we: WorkoutExercise) {
  const parts = [];
  if (we.sets) parts.push(`${we.sets}×`);
  if (we.reps) parts.push(we.reps);
  if (we.load) {
    const unit = we.load_type === "percent_1rm" ? "%" : we.load_type === "bodyweight" ? "BW" : "lbs";
    parts.push(`@ ${we.load}${unit}`);
  }
  return parts.join(" ") || "—";
}

function overrideLabel(o: Override) {
  const parts = [];
  if (o.sets) parts.push(`${o.sets}×`);
  if (o.reps) parts.push(o.reps);
  if (o.load) {
    const unit = o.load_type === "percent_1rm" ? "%" : o.load_type === "bodyweight" ? "BW" : "lbs";
    parts.push(`@ ${o.load}${unit}`);
  }
  return parts.join(" ") || "—";
}

interface EditState {
  weId: string;
  athleteId: string;
  weName: string;
  athleteName: string;
  sets: string;
  reps: string;
  load: string;
  notes: string;
}

interface PastePreviewRow {
  athleteName: string;
  athleteId: string | null;
  values: string[];
}

interface IndividualizationProps {
  exercises: WorkoutExercise[];
  athletes: Athlete[];
  initialOverrides: Override[];
}

export function Individualization({ exercises, athletes, initialOverrides }: IndividualizationProps) {
  const [overrideMap, setOverrideMap] = useState<OverrideMap>(() => buildOverrideMap(initialOverrides));
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pastePreview, setPastePreview] = useState<{ rows: PastePreviewRow[]; exCols: string[] } | null>(null);

  // Paste handler for bulk import
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const text = e.clipboardData?.getData("text");
    if (!text) return;

    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return;

    const headers = lines[0].split("\t").map((h) => h.trim());
    // First column is athlete name, rest are exercise names
    const pastedExCols = headers.slice(1);

    const rows: PastePreviewRow[] = lines.slice(1).map((line) => {
      const cols = line.split("\t");
      const name = cols[0]?.trim() ?? "";
      const athlete = athletes.find((a) => a.full_name.toLowerCase() === name.toLowerCase());
      return {
        athleteName: name,
        athleteId: athlete?.id ?? null,
        values: cols.slice(1).map((v) => v.trim()),
      };
    }).filter((r) => r.athleteName);

    if (rows.length > 0) {
      e.preventDefault();
      setPastePreview({ rows, exCols: pastedExCols });
    }
  }, [athletes]);

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  async function applyPaste() {
    if (!pastePreview) return;
    setSaving(true);

    for (const row of pastePreview.rows) {
      if (!row.athleteId) continue;
      for (let ci = 0; ci < pastePreview.exCols.length; ci++) {
        const val = row.values[ci];
        if (!val) continue;

        // Match column header to exercise name
        const colName = pastePreview.exCols[ci].toLowerCase();
        const exercise = exercises.find((e) => e.exercise_name.toLowerCase().includes(colName) || colName.includes(e.exercise_name.toLowerCase()));
        if (!exercise) continue;

        // Parse value: "4x5 @ 185" or "185" or "4x5"
        const loadMatch = val.match(/(?:@\s*)?([\d.]+)\s*(lbs|kg|%)?$/i);
        const setsRepsMatch = val.match(/^(\d+)\s*[x×]\s*(\S+)/i);

        const data: Parameters<typeof upsertOverride>[2] = {};
        if (setsRepsMatch) { data.sets = Number(setsRepsMatch[1]); data.reps = setsRepsMatch[2]; }
        if (loadMatch) data.load = Number(loadMatch[1]);

        if (Object.keys(data).length > 0) {
          await upsertOverride(exercise.id, row.athleteId, data);
          setOverrideMap((prev) => {
            const next = { ...prev };
            if (!next[exercise.id]) next[exercise.id] = {};
            next[exercise.id][row.athleteId!] = {
              ...next[exercise.id][row.athleteId!],
              id: next[exercise.id][row.athleteId!]?.id ?? "",
              workout_exercise_id: exercise.id,
              athlete_id: row.athleteId!,
              ...data,
              load_type: next[exercise.id][row.athleteId!]?.load_type ?? "absolute",
              notes: next[exercise.id][row.athleteId!]?.notes ?? null,
            };
            return next;
          });
        }
      }
    }

    setSaving(false);
    setPastePreview(null);
  }

  function openEdit(we: WorkoutExercise, athlete: Athlete) {
    const existing = overrideMap[we.id]?.[athlete.id];
    setEditing({
      weId: we.id,
      athleteId: athlete.id,
      weName: we.exercise_name,
      athleteName: athlete.full_name,
      sets: String(existing?.sets ?? ""),
      reps: existing?.reps ?? "",
      load: String(existing?.load ?? ""),
      notes: existing?.notes ?? "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const data = {
      sets: editing.sets ? Number(editing.sets) : null,
      reps: editing.reps || null,
      load: editing.load ? Number(editing.load) : null,
      notes: editing.notes || null,
    };
    await upsertOverride(editing.weId, editing.athleteId, data);
    setOverrideMap((prev) => {
      const next = { ...prev };
      if (!next[editing.weId]) next[editing.weId] = {};
      const existing = next[editing.weId][editing.athleteId];
      next[editing.weId][editing.athleteId] = {
        id: existing?.id ?? "",
        workout_exercise_id: editing.weId,
        athlete_id: editing.athleteId,
        load_type: existing?.load_type ?? "absolute",
        ...data,
      };
      return next;
    });
    setSaving(false);
    setEditing(null);
  }

  async function clearEdit() {
    if (!editing) return;
    setSaving(true);
    await deleteOverride(editing.weId, editing.athleteId);
    setOverrideMap((prev) => {
      const next = { ...prev };
      if (next[editing.weId]) {
        const { [editing.athleteId]: _, ...rest } = next[editing.weId];
        next[editing.weId] = rest;
      }
      return next;
    });
    setSaving(false);
    setEditing(null);
  }

  if (athletes.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="font-medium">No athletes linked</p>
        <p className="text-sm mt-1">Link a team to this calendar to individualize workouts per athlete.</p>
      </div>
    );
  }

  if (exercises.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">Add exercises to the workout first.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Click any cell to override an athlete&apos;s prescription. Blank = inherits base.
          You can also <strong>paste a table from Excel</strong> (athlete names in first column, exercise names as headers).
        </p>

        <div className="overflow-x-auto rounded-lg border">
          <table className="text-sm w-max min-w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-xs text-muted-foreground sticky left-0 bg-muted/50 min-w-[140px]">
                  Athlete
                </th>
                {exercises.map((we) => (
                  <th key={we.id} className="px-3 py-2 text-left font-medium text-xs min-w-[140px]">
                    <div className="font-medium truncate max-w-[130px]">{we.exercise_name}</div>
                    <div className="text-muted-foreground font-normal">{baseLabel(we)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {athletes.map((athlete) => (
                <tr key={athlete.id} className="border-t">
                  <td className="px-3 py-2 font-medium sticky left-0 bg-background text-sm">
                    {athlete.full_name}
                  </td>
                  {exercises.map((we) => {
                    const override = overrideMap[we.id]?.[athlete.id];
                    return (
                      <td key={we.id} className="px-3 py-2">
                        <button
                          onClick={() => openEdit(we, athlete)}
                          className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                            override
                              ? "bg-primary/10 text-primary font-medium hover:bg-primary/20"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {override ? overrideLabel(override) : "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit override dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.athleteName} — {editing?.weName}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="space-y-1.5">
                <Label>Sets</Label>
                <Input
                  type="number"
                  value={editing.sets}
                  onChange={(e) => setEditing({ ...editing, sets: e.target.value })}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reps</Label>
                <Input
                  value={editing.reps}
                  onChange={(e) => setEditing({ ...editing, reps: e.target.value })}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Load</Label>
                <Input
                  type="number"
                  value={editing.load}
                  onChange={(e) => setEditing({ ...editing, load: e.target.value })}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="—"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={clearEdit} disabled={saving} className="text-destructive hover:text-destructive mr-auto">
              Clear override
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paste preview dialog */}
      <Dialog open={!!pastePreview} onOpenChange={(o) => !o && setPastePreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paste {pastePreview?.rows.length} athlete overrides</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto max-h-64">
            <table className="text-xs w-full">
              <thead className="border-b">
                <tr>
                  <th className="px-2 py-1 text-left">Athlete</th>
                  {pastePreview?.exCols.map((c, i) => (
                    <th key={i} className="px-2 py-1 text-left">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pastePreview?.rows.map((row, i) => (
                  <tr key={i} className={`border-b ${!row.athleteId ? "opacity-40" : ""}`}>
                    <td className="px-2 py-1 font-medium">
                      {row.athleteName}
                      {!row.athleteId && <span className="text-destructive ml-1">(not found)</span>}
                    </td>
                    {row.values.map((v, j) => (
                      <td key={j} className="px-2 py-1 text-muted-foreground">{v || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPastePreview(null)}>Cancel</Button>
            <Button onClick={applyPaste} disabled={saving}>{saving ? "Applying…" : "Apply overrides"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
