"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileSpreadsheet, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { bulkImportMaxes, type BulkMaxRow, type BulkImportResult } from "@/app/(coach)/coach/athletes/actions";
import { epley1RM } from "@/lib/pr";

function detectCols(headers: string[]) {
  const h = headers.map((s) => String(s ?? "").toLowerCase().trim());
  const find = (...terms: string[]) => {
    const exact = h.findIndex((col) => terms.includes(col));
    if (exact >= 0) return exact;
    return h.findIndex((col) => terms.some((t) => col.includes(t)));
  };
  return {
    athlete:   find("athlete", "name", "player", "first name", "athlete name"),
    exercise:  find("exercise", "lift", "movement", "drill"),
    value:     find("max", "weight", "load", "lbs", "kg", "value"),
    reps:      find("reps", "rep", "repetitions", "rm"),
    date:      find("date", "recorded", "tested"),
  };
}

interface ParsedRow extends BulkMaxRow {
  rawWeight: number;
  estimated: boolean; // true if Epley was applied
}

export function MaxesImport() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback(async (file: File) => {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    if (rawRows.length < 2) { alert("Spreadsheet appears empty."); return; }

    const headers = rawRows[0] as string[];
    const cols = detectCols(headers);

    if (cols.athlete < 0) {
      alert("Couldn't find an Athlete column.\nExpected a header like: Athlete, Name, or Player.");
      return;
    }
    if (cols.exercise < 0) {
      alert("Couldn't find an Exercise column.\nExpected a header like: Exercise or Lift.");
      return;
    }
    if (cols.value < 0) {
      alert("Couldn't find a Max/Weight column.\nExpected a header like: Max, Weight, or Lbs.");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const parsed: ParsedRow[] = [];

    for (const row of rawRows.slice(1) as unknown[][]) {
      const get = (i: number) => (i >= 0 ? row[i] ?? "" : "");
      const athleteName = String(get(cols.athlete)).trim();
      const exerciseName = String(get(cols.exercise)).trim();
      const rawWeight = Number(get(cols.value)) || 0;
      const reps = cols.reps >= 0 ? Number(get(cols.reps)) || 1 : 1;
      const rawDate = String(get(cols.date)).trim();

      if (!athleteName || !exerciseName || !rawWeight) continue;

      // Normalise date
      let date = today;
      if (rawDate) {
        // Handle Excel serial numbers
        const num = Number(rawDate);
        if (!isNaN(num) && num > 40000) {
          const d = XLSX.SSF.parse_date_code(num);
          date = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        } else if (rawDate.includes("-") || rawDate.includes("/")) {
          date = new Date(rawDate).toISOString().split("T")[0];
        }
      }

      const estimated1RM = epley1RM(rawWeight, reps);
      parsed.push({
        athleteName,
        exerciseName,
        rawWeight,
        reps,
        value: estimated1RM,
        estimated: reps > 1,
        date,
      });
    }

    if (parsed.length === 0) { alert("No valid rows found."); return; }
    setRows(parsed);
    setResult(null);
    setOpen(true);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  async function handleImport() {
    if (!rows) return;
    setImporting(true);
    const res = await bulkImportMaxes(rows);
    setResult(res);
    setImporting(false);
  }

  function handleClose() {
    setOpen(false);
    setTimeout(() => { setRows(null); setResult(null); }, 300);
  }

  return (
    <>
      {/* Trigger button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={dragging ? "border-primary bg-primary/5" : ""}
      >
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        Import maxes
      </Button>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ""; }}
      />

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {result ? "Import complete" : `Preview — ${rows?.length} rows`}
            </DialogTitle>
          </DialogHeader>

          {/* ── Result state ── */}
          {result && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  {result.inserted} max{result.inserted !== 1 ? "es" : ""} imported successfully
                </p>
              </div>
              {result.skipped.length > 0 && (
                <div className="rounded-lg border">
                  <div className="flex items-center gap-2 border-b px-4 py-2.5 bg-muted/40">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    <p className="text-sm font-medium">{result.skipped.length} rows skipped</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y">
                    {result.skipped.map((s, i) => (
                      <div key={i} className="px-4 py-2 text-sm">
                        <span className="font-medium">{s.row.athleteName} / {s.row.exerciseName}</span>
                        <span className="text-muted-foreground ml-2">— {s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Preview table ── */}
          {!result && rows && (
            <div className="flex-1 overflow-y-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-popover border-b">
                  <tr className="text-xs text-muted-foreground uppercase">
                    <th className="px-2 py-2 text-left font-medium">Date</th>
                    <th className="px-2 py-2 text-left font-medium">Athlete</th>
                    <th className="px-2 py-2 text-left font-medium">Exercise</th>
                    <th className="px-2 py-2 text-right font-medium">Weight</th>
                    <th className="px-2 py-2 text-right font-medium">Reps</th>
                    <th className="px-2 py-2 text-right font-medium">Est. 1RM</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{row.date}</td>
                      <td className="px-2 py-1.5 font-medium">{row.athleteName}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.exerciseName}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.rawWeight}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{row.reps}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                        {row.value}
                        {row.estimated && (
                          <span className="text-xs text-muted-foreground ml-1">*</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.some((r) => r.estimated) && (
                <p className="text-xs text-muted-foreground mt-2 px-2">
                  * Estimated 1RM using Epley formula (weight × (1 + reps/30))
                </p>
              )}
            </div>
          )}

          <DialogFooter className="mt-2">
            {result ? (
              <Button onClick={handleClose}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleClose} disabled={importing}>
                  Cancel
                </Button>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? "Importing…" : `Import ${rows?.length} rows`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Format hint card (exported for use on the page) ───────────────────────────
export function MaxesImportHint() {
  return (
    <div className="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
      <FileSpreadsheet className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-foreground mb-1">Spreadsheet format</p>
        <p>Columns (header row required):</p>
        <p className="font-mono mt-1">Date · Athlete · Exercise · Max · Reps</p>
        <p className="mt-1">Reps defaults to 1 if omitted. Values &gt; 1 rep are converted to estimated 1RM.</p>
      </div>
    </div>
  );
}
