"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Copy } from "lucide-react";
import { copyWorkout } from "@/app/(coach)/coach/calendar/actions";
import { toast } from "sonner";

type Mode = "single" | "multi" | "weekly";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeWeeklyDates(start: string, end: string, days: number[]): string[] {
  if (!start || !end || days.length === 0) return [];
  const dates: string[] = [];
  const cur = new Date(start + "T12:00:00");
  const endD = new Date(end + "T12:00:00");
  while (cur <= endD) {
    if (days.includes(cur.getDay())) dates.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function MultiDatePicker({ selected, onChange }: { selected: string[]; onChange: (dates: string[]) => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function toggle(day: number) {
    const ds = formatDate(new Date(year, month, day));
    onChange(selected.includes(ds) ? selected.filter((d) => d !== ds) : [...selected, ds]);
  }

  function prev() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button onClick={prev} className="p-1 rounded hover:bg-muted text-sm">←</button>
        <span className="text-sm font-medium">{MONTH_NAMES[month]} {year}</span>
        <button onClick={next} className="p-1 rounded hover:bg-muted text-sm">→</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DAY_LABELS.map((d) => <div key={d} className="text-xs text-muted-foreground py-1">{d}</div>)}
        {cells.map((day, i) => {
          const ds = day ? formatDate(new Date(year, month, day)) : null;
          const active = ds ? selected.includes(ds) : false;
          return (
            <button
              key={i}
              disabled={!day}
              onClick={() => day && toggle(day)}
              className={`text-xs py-1 rounded transition-colors ${
                !day ? "invisible" : active
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-muted"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">{selected.length} date{selected.length !== 1 ? "s" : ""} selected</p>
      )}
    </div>
  );
}

interface CopyWorkoutModalProps {
  workoutId: string;
  workoutTitle: string;
}

export function CopyWorkoutModal({ workoutId, workoutTitle }: CopyWorkoutModalProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("single");
  const [loading, setLoading] = useState(false);
  const [replace, setReplace] = useState(false);

  // Single
  const [singleDate, setSingleDate] = useState("");

  // Multi
  const [multiDates, setMultiDates] = useState<string[]>([]);

  // Weekly
  const [weeklyStart, setWeeklyStart] = useState("");
  const [weeklyEnd, setWeeklyEnd] = useState("");
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);

  const weeklyDates = useMemo(
    () => computeWeeklyDates(weeklyStart, weeklyEnd, weeklyDays),
    [weeklyStart, weeklyEnd, weeklyDays]
  );

  function toggleDay(d: number) {
    setWeeklyDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  const targetDates = mode === "single"
    ? singleDate ? [singleDate] : []
    : mode === "multi"
    ? multiDates
    : weeklyDates;

  async function handleCopy() {
    if (targetDates.length === 0) return;
    setLoading(true);
    try {
      await copyWorkout(workoutId, targetDates, replace);
      setOpen(false);
      setSingleDate("");
      setMultiDates([]);
      setWeeklyStart("");
      setWeeklyEnd("");
      setWeeklyDays([]);
      setReplace(false);
    } catch {
      toast.error("Failed to copy workout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="h-4 w-4 mr-1.5" /> Copy
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copy "{workoutTitle}"</DialogTitle>
          </DialogHeader>

          {/* Mode selector */}
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(["single", "multi", "weekly"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 capitalize transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {m === "single" ? "Single date" : m === "multi" ? "Specific dates" : "Weekly pattern"}
              </button>
            ))}
          </div>

          {/* Single */}
          {mode === "single" && (
            <div className="space-y-1.5">
              <Label>Date</Label>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

          {/* Multi */}
          {mode === "multi" && (
            <MultiDatePicker selected={multiDates} onChange={setMultiDates} />
          )}

          {/* Weekly */}
          {mode === "weekly" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>From</Label>
                  <input
                    type="date"
                    value={weeklyStart}
                    onChange={(e) => setWeeklyStart(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>To</Label>
                  <input
                    type="date"
                    value={weeklyEnd}
                    onChange={(e) => setWeeklyEnd(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Days of week</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAY_LABELS.map((label, idx) => (
                    <button
                      key={idx}
                      onClick={() => toggleDay(idx)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        weeklyDays.includes(idx)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-input hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {weeklyDates.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Will create {weeklyDates.length} workout{weeklyDates.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}

          {/* Replace toggle */}
          <button
            type="button"
            onClick={() => setReplace((r) => !r)}
            className="flex items-center gap-3 w-full rounded-lg border px-3 py-2.5 text-sm text-left hover:bg-muted/50 transition-colors"
          >
            <div className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${replace ? "bg-primary" : "bg-input"}`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${replace ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <div>
              <p className="font-medium leading-none">Replace existing workouts</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Delete any existing workout on the target date before copying
              </p>
            </div>
          </button>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCopy} disabled={targetDates.length === 0 || loading}>
              {loading ? "Copying…" : `Copy to ${targetDates.length} date${targetDates.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
