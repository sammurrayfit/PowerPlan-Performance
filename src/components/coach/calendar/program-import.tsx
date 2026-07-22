"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileSpreadsheet, AlertTriangle, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Athlete {
  id: string;
  full_name: string;
}

interface SheetExercise {
  date: string;
  workoutTitle: string;
  supersetGroup: string | null;
  exerciseName: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  loadType: "absolute" | "percent_1rm" | "bodyweight";
  tempo: string | null;
  restSeconds: number | null;
  notes: string | null;
}

interface AthleteSheet {
  sheetName: string;
  athleteId: string | null;
  rows: SheetExercise[];
}

interface ParsedProgram {
  sheets: AthleteSheet[];
  warnings: string[];
}

function parseLoadType(raw: string): "absolute" | "percent_1rm" | "bodyweight" {
  const v = raw.toLowerCase();
  if (v.includes("%") || v.includes("percent") || v.includes("1rm")) return "percent_1rm";
  if (v.includes("bw") || v.includes("body")) return "bodyweight";
  return "absolute";
}

function toDateStr(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "number") {
    const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function findCol(headers: string[], ...terms: string[]): number {
  const h = headers.map((s) => String(s ?? "").toLowerCase().trim());
  // Prefer exact match to avoid partial collisions (e.g. "set" hitting "superset")
  const exact = h.findIndex((col) => terms.includes(col));
  if (exact >= 0) return exact;
  return h.findIndex((col) => terms.some((t) => col.includes(t)));
}

function parseProgram(workbook: import("xlsx").WorkBook, athletes: Athlete[]): ParsedProgram {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const warnings: string[] = [];
  const sheets: AthleteSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (rows.length < 2) continue;

    const h = rows[0] as string[];
    const col = {
      date:      findCol(h, "date"),
      workout:   findCol(h, "workout", "title", "session"),
      superset:  findCol(h, "superset", "ss", "group"),
      exercise:  findCol(h, "exercise", "movement", "lift", "drill"),
      sets:      findCol(h, "sets", "set"),
      reps:      findCol(h, "reps", "rep"),
      load:      findCol(h, "load", "weight", "lbs", "kg", "intensity"),
      loadType:  findCol(h, "load type", "type", "unit"),
      tempo:     findCol(h, "tempo"),
      rest:      findCol(h, "rest"),
      notes:     findCol(h, "notes", "note", "cue", "coaching"),
    };

    if (col.date < 0 || col.exercise < 0) {
      warnings.push(`Sheet "${sheetName}" skipped — missing Date or Exercise column.`);
      continue;
    }

    // Match sheet name to athlete
    const athlete = athletes.find(
      (a) => a.full_name.toLowerCase() === sheetName.toLowerCase()
    );
    if (!athlete) warnings.push(`Athlete not found for sheet "${sheetName}" — overrides will be skipped.`);

    const sheetRows: SheetExercise[] = [];
    for (const row of rows.slice(1) as unknown[][]) {
      const dateStr = toDateStr(row[col.date]);
      const exerciseName = String(row[col.exercise] ?? "").trim();
      if (!dateStr || !exerciseName) continue;

      const workoutTitle = col.workout >= 0 ? String(row[col.workout] ?? "").trim() || `Workout ${dateStr}` : `Workout ${dateStr}`;
      const loadTypeRaw = col.loadType >= 0 ? String(row[col.loadType] ?? "") : "";
      const supersetRaw = col.superset >= 0 ? String(row[col.superset] ?? "").trim().toUpperCase() : "";

      sheetRows.push({
        date: dateStr,
        workoutTitle,
        supersetGroup: supersetRaw || null,
        exerciseName,
        sets:        col.sets >= 0 && row[col.sets] !== "" ? Number(row[col.sets]) || null : null,
        reps:        col.reps >= 0 ? String(row[col.reps] ?? "").trim() || null : null,
        load:        col.load >= 0 && row[col.load] !== "" ? Number(row[col.load]) || null : null,
        loadType:    parseLoadType(loadTypeRaw),
        tempo:       col.tempo >= 0 ? String(row[col.tempo] ?? "").trim() || null : null,
        restSeconds: col.rest >= 0 && row[col.rest] !== "" ? Number(row[col.rest]) || null : null,
        // Strip notes from C superset (core/accessory block) — asymmetry callouts don't belong there
        notes:       col.notes >= 0 && supersetRaw !== "C" ? String(row[col.notes] ?? "").trim() || null : null,
      });
    }

    if (sheetRows.length > 0) {
      sheets.push({ sheetName, athleteId: athlete?.id ?? null, rows: sheetRows });
    }
  }

  return { sheets, warnings };
}

interface ProgramImportProps {
  calendarId: string;
  athletes: Athlete[];
  effectiveCoachId: string;
}

export function ProgramImport({ calendarId, athletes, effectiveCoachId }: ProgramImportProps) {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [program, setProgram] = useState<ParsedProgram | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const headers = ["Date", "Workout", "Superset", "Exercise", "Sets", "Reps", "Load", "Type", "Tempo", "Rest", "Notes"];
    const sample = ["2026-06-01", "Morning Lift", "", "Back Squat", 4, "5", 185, "absolute", "", 180, ""];

    const sheetNames = athletes.length > 0
      ? athletes.map((a) => a.full_name)
      : ["Athlete Name"];

    for (const name of sheetNames) {
      const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
      // Column widths
      ws["!cols"] = [12, 16, 10, 20, 6, 8, 8, 10, 8, 6, 20].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); // Excel sheet name max 31 chars
    }

    XLSX.writeFile(wb, "program-template.xlsx");
  }

  async function parseFile(file: File) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const parsed = parseProgram(workbook, athletes);
    if (parsed.sheets.length === 0) {
      alert("No data found. Make sure each sheet has Date and Exercise columns.");
      return;
    }
    setProgram(parsed);
    setDialogOpen(true);
  }

  async function handleImport() {
    if (!program) return;
    setImporting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setImporting(false); return; }

    const { data: exData } = await supabase.from("exercises").select("id, name");
    let allExercises: { id: string; name: string }[] = exData ?? [];

    async function findOrCreateExercise(name: string): Promise<{ id: string; name: string } | null> {
      let match = allExercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
      if (!match) match = allExercises.find((e) =>
        e.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(e.name.toLowerCase())
      );
      if (!match) {
        const { data: created } = await supabase
          .from("exercises")
          .insert({ name, is_public: false, created_by: user!.id })
          .select("id, name").single();
        if (created) { match = created; allExercises.push(created); }
      }
      return match ?? null;
    }

    // ── Step 1: Build the union of all MAIN workouts across every sheet ──────
    // Pre-activation rows are excluded from the team workout entirely.
    // workoutMap: `${date}||${title}` → ordered list of unique exercises
    const workoutMap = new Map<string, SheetExercise[]>();
    for (const sheet of program.sheets) {
      for (const row of sheet.rows) {
        if (row.workoutTitle === "Pre-Activation") continue;
        const key = `${row.date}||${row.workoutTitle}`;
        if (!workoutMap.has(key)) workoutMap.set(key, []);
        const existing = workoutMap.get(key)!;
        const nameLower = row.exerciseName.toLowerCase();
        if (!existing.some((e) => e.exerciseName.toLowerCase() === nameLower)) {
          existing.push(row);
        }
      }
    }

    // ── Step 2: Create main workouts + base workout_exercises (unchanged) ────
    const weIndex = new Map<string, string>();

    for (const [key, baseExercises] of workoutMap) {
      const splitAt = key.indexOf("||");
      const date = key.slice(0, splitAt);
      const title = key.slice(splitAt + 2);
      setProgress(`Creating "${title}" (${date})…`);

      const { data: w } = await supabase
        .from("workouts")
        .insert({ calendar_id: calendarId, date, title })
        .select("id")
        .single();
      if (!w) continue;

      for (let i = 0; i < baseExercises.length; i++) {
        const ex = baseExercises[i];
        const match = await findOrCreateExercise(ex.exerciseName);
        if (!match) continue;

        const { data: we } = await supabase
          .from("workout_exercises")
          .insert({
            workout_id: w.id,
            exercise_id: match.id,
            sort_order: i,
            sets: ex.sets,
            reps: ex.reps,
            load: ex.load,
            load_type: ex.loadType,
            tempo: ex.tempo,
            rest_seconds: ex.restSeconds,
            notes: ex.notes,
            superset_group: ex.supersetGroup,
          })
          .select("id").single();

        if (we) weIndex.set(`${date}||${ex.exerciseName.toLowerCase()}`, we.id);
      }
    }

    // ── Step 3: Per-athlete overrides for main exercises only ────────────────
    for (const sheet of program.sheets) {
      if (!sheet.athleteId) continue;
      setProgress(`Applying overrides for ${sheet.sheetName}…`);

      for (const row of sheet.rows) {
        if (row.workoutTitle === "Pre-Activation") continue;
        const weId = weIndex.get(`${row.date}||${row.exerciseName.toLowerCase()}`);
        if (!weId) continue;

        await supabase.from("athlete_exercise_overrides").upsert(
          {
            workout_exercise_id: weId,
            athlete_id: sheet.athleteId,
            sets: row.sets,
            reps: row.reps,
            load: row.load,
            load_type: row.loadType,
            notes: row.notes,
          },
          { onConflict: "workout_exercise_id,athlete_id" }
        );
      }
    }

    // ── Step 4: Per-athlete pre-activation (stored in individual calendars) ──
    // Each athlete gets their own "Pre-Activation" calendar so the team workout
    // is never polluted. The athlete's workout page fetches and renders these
    // above the main lift.
    const athleteCalendarCache = new Map<string, string>(); // athleteId → calendarId

    for (const sheet of program.sheets) {
      if (!sheet.athleteId) continue;
      const preActRows = sheet.rows.filter((r) => r.workoutTitle === "Pre-Activation");
      if (preActRows.length === 0) continue;

      setProgress(`Creating pre-activation for ${sheet.sheetName}…`);

      // Find or create this athlete's personal pre-activation calendar
      let preActCalId = athleteCalendarCache.get(sheet.athleteId);
      if (!preActCalId) {
        const { data: existing } = await supabase
          .from("calendars")
          .select("id")
          .eq("athlete_id", sheet.athleteId)
          .eq("coach_id", effectiveCoachId)
          .eq("name", "Pre-Activation")
          .maybeSingle();

        if (existing) {
          preActCalId = existing.id;
        } else {
          const { data: created } = await supabase
            .from("calendars")
            .insert({ athlete_id: sheet.athleteId, coach_id: effectiveCoachId, name: "Pre-Activation", color: "#f59e0b" })
            .select("id")
            .single();
          preActCalId = created?.id ?? undefined;
        }
        if (preActCalId) athleteCalendarCache.set(sheet.athleteId, preActCalId);
      }
      if (!preActCalId) continue;

      // Group by date and create a workout per date
      const byDate = new Map<string, SheetExercise[]>();
      for (const row of preActRows) {
        if (!byDate.has(row.date)) byDate.set(row.date, []);
        byDate.get(row.date)!.push(row);
      }

      for (const [date, rows] of byDate) {
        const { data: w } = await supabase
          .from("workouts")
          .insert({ calendar_id: preActCalId, date, title: "Pre-Activation" })
          .select("id")
          .single();
        if (!w) continue;

        for (let i = 0; i < rows.length; i++) {
          const ex = rows[i];
          const match = await findOrCreateExercise(ex.exerciseName);
          if (!match) continue;
          await supabase.from("workout_exercises").insert({
            workout_id: w.id,
            exercise_id: match.id,
            sort_order: i,
            sets: ex.sets,
            reps: ex.reps,
            load: ex.load,
            load_type: ex.loadType,
            tempo: ex.tempo,
            rest_seconds: ex.restSeconds,
            notes: ex.notes,
            superset_group: ex.supersetGroup,
            is_pre_activation: true,
          });
        }
      }
    }

    setImporting(false);
    setDialogOpen(false);
    setProgram(null);
    setProgress("");
    router.refresh();
  }

  const totalRows = program?.sheets.reduce((n, s) => n + s.rows.length, 0) ?? 0;
  const unmatchedSheets = program?.sheets.filter((s) => !s.athleteId).map((s) => s.sheetName) ?? [];
  const uniqueWorkouts = program
    ? new Set(program.sheets.flatMap((s) => s.rows.filter((r) => r.workoutTitle !== "Pre-Activation").map((r) => `${r.date}||${r.workoutTitle}`))).size
    : 0;

  return (
    <>
      <div className="space-y-2">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ""; }}
          />
          <FileSpreadsheet className={`h-7 w-7 mx-auto mb-2 ${dragging ? "text-primary" : "text-muted-foreground"}`} />
          <p className="text-sm font-medium">Import program from Excel</p>
          <p className="text-xs text-muted-foreground mt-1">
            One sheet per athlete — sheet name must match athlete name
            <br />
            Columns: Date · Workout · Superset · Exercise · Sets · Reps · Load · Type · Tempo · Notes
          </p>
        </div>

        <button
          onClick={downloadTemplate}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          <Download className="h-3.5 w-3.5" />
          Download template
          {athletes.length > 0 && ` (${athletes.length} athlete sheet${athletes.length !== 1 ? "s" : ""})`}
        </button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !importing && setDialogOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import program</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-bold">{program?.sheets.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">athletes</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-bold">{uniqueWorkouts}</p>
                <p className="text-xs text-muted-foreground mt-0.5">workouts</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-bold">{totalRows}</p>
                <p className="text-xs text-muted-foreground mt-0.5">exercises</p>
              </div>
            </div>

            {unmatchedSheets.length > 0 && (
              <div className="flex gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-400">Sheets not matched to athletes (no overrides):</p>
                  <p className="text-yellow-700 dark:text-yellow-500 mt-0.5">{unmatchedSheets.join(", ")}</p>
                  <p className="text-yellow-600 dark:text-yellow-600 mt-1">Sheet names must exactly match athlete names in the system.</p>
                </div>
              </div>
            )}

            {program?.warnings.filter((w) => !w.startsWith("Athlete")).map((w, i) => (
              <div key={i} className="flex gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{w}
              </div>
            ))}

            <div className="rounded-lg border divide-y max-h-52 overflow-y-auto">
              {program?.sheets.map((sheet) => (
                <div key={sheet.sheetName} className="px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${sheet.athleteId ? "bg-green-500" : "bg-yellow-400"}`} />
                    <p className="font-medium text-xs">{sheet.sheetName}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{sheet.rows.length} rows</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Each sheet creates workouts. Sheets whose names match an athlete generate per-athlete load overrides — athletes without a sheet see the base prescription.
            </p>

            {importing && progress && (
              <p className="text-xs text-muted-foreground text-center animate-pulse">{progress}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={importing}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? "Importing…" : `Import ${uniqueWorkouts} workouts`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
