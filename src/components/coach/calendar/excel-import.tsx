"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileSpreadsheet } from "lucide-react";

export interface ParsedExerciseRow {
  exerciseName: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  loadType: "absolute" | "percent_1rm" | "bodyweight";
  tempo: string | null;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
}

interface ExcelImportProps {
  onImport: (rows: ParsedExerciseRow[]) => Promise<void>;
}

function detectColumns(headers: string[]) {
  const h = headers.map((s) => String(s ?? "").toLowerCase().trim());
  const find = (...terms: string[]) =>
    h.findIndex((col) => terms.some((t) => col.includes(t)));
  return {
    exercise: find("exercise", "name", "movement", "lift", "drill"),
    sets: find("sets", "set"),
    reps: find("reps", "rep", "repetition"),
    load: find("load", "weight", "lbs", "kg", "intensity"),
    loadType: find("load type", "type", "unit"),
    tempo: find("tempo"),
    rest: find("rest"),
    notes: find("notes", "note", "comment", "cue", "coaching"),
    superset: find("superset", "ss", "group"),
  };
}

type ColMap = ReturnType<typeof detectColumns>;

function parseRow(row: unknown[], colMap: ColMap): ParsedExerciseRow | null {
  const get = (idx: number) => (idx >= 0 ? (row[idx] ?? "") : "");
  const exerciseName = String(get(colMap.exercise)).trim();
  if (!exerciseName) return null;

  const setsRaw = get(colMap.sets);
  const loadRaw = get(colMap.load);
  const restRaw = get(colMap.rest);
  const loadTypeRaw = String(get(colMap.loadType)).toLowerCase();
  const reps = String(get(colMap.reps)).trim() || null;

  // Skip rows that look like section headers (no sets/reps/load data)
  if (!setsRaw && !reps && !loadRaw) return null;

  let loadType: "absolute" | "percent_1rm" | "bodyweight" = "absolute";
  if (loadTypeRaw.includes("%") || loadTypeRaw.includes("percent") || loadTypeRaw.includes("1rm")) {
    loadType = "percent_1rm";
  } else if (loadTypeRaw.includes("bw") || loadTypeRaw.includes("body")) {
    loadType = "bodyweight";
  }

  const supersetRaw = String(get(colMap.superset)).trim().toUpperCase();

  return {
    exerciseName,
    sets: setsRaw !== "" ? Number(setsRaw) || null : null,
    reps,
    load: loadRaw !== "" ? Number(loadRaw) || null : null,
    loadType,
    tempo: String(get(colMap.tempo)).trim() || null,
    restSeconds: restRaw !== "" ? Number(restRaw) || null : null,
    notes: String(get(colMap.notes)).trim() || null,
    supersetGroup: supersetRaw || null,
  };
}

export function ExcelImport({ onImport }: ExcelImportProps) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ParsedExerciseRow[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback(async (file: File) => {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

    if (rows.length < 2) {
      alert("The spreadsheet appears to be empty.");
      return;
    }

    const headers = rows[0] as string[];
    const colMap = detectColumns(headers);

    if (colMap.exercise < 0) {
      alert(
        "Couldn't find an exercise name column.\n\nMake sure your spreadsheet has a header row with a column named 'Exercise', 'Name', or 'Movement'."
      );
      return;
    }

    const parsed = rows
      .slice(1)
      .map((row) => parseRow(row as unknown[], colMap))
      .filter((r): r is ParsedExerciseRow => r !== null);

    if (parsed.length === 0) {
      alert("No exercises found in the spreadsheet.");
      return;
    }

    setPreview(parsed);
    setDialogOpen(true);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  }

  async function handleConfirm() {
    if (!preview) return;
    setImporting(true);
    await onImport(preview);
    setImporting(false);
    setDialogOpen(false);
    setPreview(null);
  }

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileInput}
        />
        <FileSpreadsheet className={`h-8 w-8 mx-auto mb-2 ${dragging ? "text-primary" : "text-muted-foreground"}`} />
        <p className="text-sm font-medium">Drop an Excel file to import exercises</p>
        <p className="text-xs text-muted-foreground mt-1">
          .xlsx · .xls · .csv — needs a header row with columns like Exercise, Sets, Reps, Load
        </p>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Import {preview?.length} exercises</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-4 px-4">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-popover border-b">
                <tr className="text-xs text-muted-foreground uppercase">
                  <th className="px-2 py-2 text-left font-medium">Exercise</th>
                  <th className="px-2 py-2 text-left font-medium w-14">Sets</th>
                  <th className="px-2 py-2 text-left font-medium w-16">Reps</th>
                  <th className="px-2 py-2 text-left font-medium w-16">Load</th>
                  <th className="px-2 py-2 text-left font-medium w-14">Type</th>
                  <th className="px-2 py-2 text-left font-medium w-14">Rest</th>
                  <th className="px-2 py-2 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview?.map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-2 py-1.5 font-medium">{row.exerciseName}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.sets ?? "—"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.reps ?? "—"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.load ?? "—"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {row.loadType === "percent_1rm" ? "%" : row.loadType === "bodyweight" ? "BW" : "lbs"}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {row.restSeconds ? `${row.restSeconds}s` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={importing}>
              {importing ? "Importing…" : `Import ${preview?.length} exercises`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
