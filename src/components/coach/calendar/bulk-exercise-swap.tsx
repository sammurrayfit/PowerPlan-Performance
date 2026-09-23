"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Repeat, ArrowLeft } from "lucide-react";
import { ExercisePicker } from "./exercise-picker";
import { previewExerciseSwap, applyExerciseSwap } from "@/app/(coach)/coach/calendar/actions";

interface Exercise {
  id: string;
  name: string;
  muscle_groups: string[];
}

interface Match {
  workoutExerciseId: string;
  workoutId: string;
  date: string;
  title: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function BulkExerciseSwap({
  calendarId,
  usedExercises,
  allExercises,
}: {
  calendarId: string;
  usedExercises: Exercise[];
  allExercises: Exercise[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [fromId, setFromId] = useState<string>("");
  const [toExercise, setToExercise] = useState<Exercise | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState<Set<number>>(new Set());
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);

  function reset() {
    setStep("form");
    setFromId("");
    setToExercise(null);
    setStartDate(todayStr());
    setEndDate("");
    setDays(new Set());
    setMatches([]);
  }

  function toggleDay(d: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function handlePreview() {
    if (!fromId || !toExercise) return;
    setLoading(true);
    try {
      const { matches } = await previewExerciseSwap({
        calendarId,
        fromExerciseId: fromId,
        startDate,
        endDate: endDate || null,
        daysOfWeek: days.size > 0 ? Array.from(days) : undefined,
      });
      setMatches(matches);
      setStep("preview");
    } catch {
      toast.error("Failed to preview swap");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!fromId || !toExercise) return;
    setLoading(true);
    try {
      const { updatedCount } = await applyExerciseSwap({
        calendarId,
        fromExerciseId: fromId,
        toExerciseId: toExercise.id,
        startDate,
        endDate: endDate || null,
        daysOfWeek: days.size > 0 ? Array.from(days) : undefined,
      });
      toast.success(`Swapped on ${updatedCount} workout${updatedCount === 1 ? "" : "s"}`);
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      toast.error("Failed to apply swap");
    } finally {
      setLoading(false);
    }
  }

  const fromExercise = usedExercises.find((e) => e.id === fromId) ?? null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Repeat className="h-3.5 w-3.5" />
        Swap Exercise
      </Button>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{step === "form" ? "Swap exercise" : "Confirm swap"}</SheetTitle>
          </SheetHeader>

          {step === "form" ? (
            <div className="space-y-5 mt-2 px-4">
              {usedExercises.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No exercises found in this calendar yet.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Replace</Label>
                    <Select value={fromId} onValueChange={(v) => setFromId(v ?? "")}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose an exercise…" />
                      </SelectTrigger>
                      <SelectContent>
                        {usedExercises.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>With</Label>
                    {toExercise ? (
                      <button
                        onClick={() => setPickerOpen(true)}
                        className="w-full text-left px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors"
                      >
                        {toExercise.name}
                        <span className="text-xs text-muted-foreground ml-2">Change</span>
                      </button>
                    ) : (
                      <Button variant="outline" className="w-full justify-start" onClick={() => setPickerOpen(true)}>
                        Choose replacement…
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Start date</Label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>End date (optional)</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Days of week (optional)</Label>
                    <p className="text-xs text-muted-foreground">Leave blank to match every day.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {DAY_LABELS.map((label, idx) => (
                        <button
                          key={idx}
                          onClick={() => toggleDay(idx)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            days.has(idx)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    disabled={!fromId || !toExercise || loading}
                    onClick={handlePreview}
                  >
                    {loading ? "Checking…" : "Preview changes"}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 mt-2 px-4">
              <p className="text-sm mb-3">
                Replacing <span className="font-semibold">{fromExercise?.name}</span> with{" "}
                <span className="font-semibold">{toExercise?.name}</span> on{" "}
                <span className="font-semibold">{matches.length}</span> workout{matches.length === 1 ? "" : "s"}:
              </p>

              {matches.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No matching workouts found for these filters.
                </p>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-1 border rounded-md p-2">
                  {matches.map((m) => (
                    <div key={m.workoutExerciseId} className="text-sm px-2 py-1.5 rounded hover:bg-muted/50">
                      <span className="font-medium">{formatDate(m.date)}</span>
                      <span className="text-muted-foreground ml-2">{m.title}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setStep("form")} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
                <Button className="flex-1" onClick={handleConfirm} disabled={matches.length === 0 || loading}>
                  {loading ? "Applying…" : "Confirm swap"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* "With" exercise picker */}
      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Choose replacement exercise</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 mt-2">
            <ExercisePicker
              exercises={allExercises}
              onSelect={(ex) => {
                setToExercise(ex);
                setPickerOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
