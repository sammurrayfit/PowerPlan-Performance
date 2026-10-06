"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, Search } from "lucide-react";
import { fetchWorkoutExport, type WorkoutExportRow } from "@/app/(coach)/coach/athletes/export-actions";

interface Team {
  id: string;
  name: string;
  athletes: { id: string; full_name: string }[];
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function mondayOf(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

const PRESETS: { label: string; range: () => [Date, Date] }[] = [
  { label: "This week", range: () => { const m = mondayOf(new Date()); return [m, addDays(m, 6)]; } },
  { label: "Next week", range: () => { const m = addDays(mondayOf(new Date()), 7); return [m, addDays(m, 6)]; } },
  { label: "Next 4 weeks", range: () => { const m = mondayOf(new Date()); return [m, addDays(m, 27)]; } },
  { label: "This month", range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 0)]; } },
  { label: "Last month", range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; } },
];

const COLUMNS: { header: string; key: keyof WorkoutExportRow; width: number }[] = [
  { header: "Athlete", key: "athleteName", width: 20 },
  { header: "Date", key: "date", width: 11 },
  { header: "Calendar", key: "calendarName", width: 16 },
  { header: "Workout", key: "workoutTitle", width: 22 },
  { header: "Attendance", key: "attendance", width: 11 },
  { header: "RPE Pre", key: "rpePre", width: 8 },
  { header: "RPE Post", key: "rpePost", width: 8 },
  { header: "#", key: "order", width: 4 },
  { header: "Exercise", key: "exerciseName", width: 26 },
  { header: "Sets", key: "sets", width: 6 },
  { header: "Reps", key: "reps", width: 8 },
  { header: "Load", key: "load", width: 10 },
  { header: "Target (lbs)", key: "targetLbs", width: 11 },
  { header: "Tempo", key: "tempo", width: 8 },
  { header: "Rest (s)", key: "restSeconds", width: 8 },
  { header: "Coach Notes", key: "coachNotes", width: 30 },
  { header: "Sets Logged", key: "setsLogged", width: 10 },
  { header: "Logged (lbs × reps @RPE)", key: "loggedSets", width: 36 },
  { header: "Top Load", key: "topLoad", width: 9 },
  { header: "Avg RPE", key: "avgRpe", width: 8 },
  { header: "Athlete Notes", key: "athleteNotes", width: 30 },
];

// Excel sheet names: max 31 chars, no []:*?/\ and unique per workbook.
function sheetName(name: string, used: Set<string>) {
  const base = name.replace(/[[\]:*?/\\]/g, "").trim().slice(0, 28) || "Athlete";
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base} ${i}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

async function downloadWorkbook(rows: WorkoutExportRow[], startDate: string, endDate: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  function addSheet(sheetRows: WorkoutExportRow[], name: string, includeAthlete: boolean) {
    const cols = includeAthlete ? COLUMNS : COLUMNS.filter((c) => c.key !== "athleteName");
    const data = [
      cols.map((c) => c.header),
      ...sheetRows.map((r) =>
        cols.map((c) => {
          const v = r[c.key];
          return v === null || v === "" ? "" : v;
        })
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = cols.map((c) => ({ wch: c.width }));
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: cols.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const byAthlete = new Map<string, WorkoutExportRow[]>();
  for (const r of rows) {
    const list = byAthlete.get(r.athleteName) ?? [];
    list.push(r);
    byAthlete.set(r.athleteName, list);
  }

  const used = new Set<string>();
  if (byAthlete.size > 1) addSheet(rows, sheetName("All Athletes", used), true);
  for (const [name, list] of byAthlete) addSheet(list, sheetName(name, used), byAthlete.size === 1);

  const label = byAthlete.size === 1 ? [...byAthlete.keys()][0].replace(/\s+/g, "-") : "workouts";
  XLSX.writeFile(wb, `${label}_${startDate}_to_${endDate}.xlsx`);
}

// The export form itself — rendered inside a dialog on the Athletes page and
// inline on the Coaching Tools "Export" tab.
export function WorkoutExportForm({
  teams,
  inline = false,
  onExported,
  onCancel,
}: {
  teams: Team[];
  inline?: boolean;
  onExported?: () => void;
  onCancel?: () => void;
}) {
  const [startDate, setStartDate] = useState(() => toDateStr(mondayOf(new Date())));
  const [endDate, setEndDate] = useState(() => toDateStr(addDays(mondayOf(new Date()), 6)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const allAthleteIds = useMemo(
    () => [...new Set(teams.flatMap((t) => t.athletes.map((a) => a.id)))],
    [teams]
  );

  const q = query.trim().toLowerCase();
  const visibleTeams = teams
    .map((t) => ({ ...t, athletes: q ? t.athletes.filter((a) => a.full_name.toLowerCase().includes(q)) : t.athletes }))
    .filter((t) => t.athletes.length > 0);

  function toggleAthlete(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setMany(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id); else next.delete(id);
      }
      return next;
    });
  }

  function applyPreset(range: () => [Date, Date]) {
    const [s, e] = range();
    setStartDate(toDateStr(s));
    setEndDate(toDateStr(e));
  }

  async function handleExport() {
    setLoading(true);
    try {
      const result = await fetchWorkoutExport([...selected], startDate, endDate);
      if (!result.ok) { toast.error(result.error); return; }
      if (result.rows.length === 0) { toast.info("No workouts scheduled for those athletes in that date range."); return; }
      await downloadWorkbook(result.rows, startDate, endDate);
      toast.success(`Exported ${selected.size} athlete${selected.size === 1 ? "" : "s"}`);
      onExported?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setLoading(false);
    }
  }

  const invalidRange = !startDate || !endDate || startDate > endDate;

  const actions = (
    <>
      {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
      <Button onClick={handleExport} disabled={loading || selected.size === 0 || invalidRange}>
        <Download className="h-3.5 w-3.5 mr-1.5" />
        {loading ? "Exporting…" : "Download .xlsx"}
      </Button>
    </>
  );

  return (
    <>
      <div className={inline ? "flex flex-col gap-4" : "flex-1 min-h-0 flex flex-col gap-4 overflow-hidden"}>
        {/* Date range */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} max={endDate || undefined} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.range)}
                className="px-2.5 py-1 rounded-full text-xs font-medium border text-muted-foreground hover:bg-muted transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Athletes */}
        <div className={inline ? "flex flex-col gap-2" : "flex-1 min-h-0 flex flex-col gap-2"}>
          <div className="flex items-center justify-between">
            <Label>Athletes <span className="text-muted-foreground font-normal">({selected.size} selected)</span></Label>
            <div className="flex gap-3 text-xs">
              <button type="button" className="text-primary hover:underline" onClick={() => setMany(allAthleteIds, true)}>Select all</button>
              <button type="button" className="text-muted-foreground hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search athletes…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
          </div>
          <div className={`overflow-y-auto border rounded-md divide-y ${inline ? "max-h-[28rem]" : "flex-1 min-h-0"}`}>
            {visibleTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No athletes found.</p>
            ) : visibleTeams.map((team) => {
              const ids = team.athletes.map((a) => a.id);
              const count = ids.filter((id) => selected.has(id)).length;
              return (
                <div key={team.id}>
                  <label className="flex items-center gap-2.5 px-3 py-2 bg-muted/40 cursor-pointer sticky top-0 z-10">
                    <Checkbox
                      checked={count === ids.length}
                      indeterminate={count > 0 && count < ids.length}
                      onCheckedChange={(on) => setMany(ids, !!on)}
                    />
                    <span className="text-sm font-semibold flex-1">{team.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{count}/{ids.length}</span>
                  </label>
                  {team.athletes.map((a) => (
                    <label key={a.id} className="flex items-center gap-2.5 px-3 py-1.5 pl-8 cursor-pointer hover:bg-muted/40">
                      <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleAthlete(a.id)} />
                      <span className="text-sm">{a.full_name}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {inline ? <div className="flex justify-end gap-2">{actions}</div> : <DialogFooter>{actions}</DialogFooter>}
    </>
  );
}

export function WorkoutExport({ teams }: { teams: Team[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download className="h-3.5 w-3.5 mr-1.5" />
        Export workouts
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Export workouts</DialogTitle>
          </DialogHeader>
          <WorkoutExportForm teams={teams} onExported={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
