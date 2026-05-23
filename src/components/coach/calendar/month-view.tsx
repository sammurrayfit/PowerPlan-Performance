"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, Lock, Plus } from "lucide-react";
import { createWorkout } from "@/app/(coach)/coach/calendar/actions";
import type { Database } from "@/lib/supabase/types";

type Calendar = Database["public"]["Tables"]["calendars"]["Row"];
type Workout = Pick<Database["public"]["Tables"]["workouts"]["Row"], "id" | "date" | "title" | "is_locked">;

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface MonthViewProps {
  calendar: Calendar;
  workouts: Workout[];
  year: number;
  month: number;
}

function getMonthParam(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function prevMonth(year: number, month: number) {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function MonthView({ calendar, workouts, year, month }: MonthViewProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");

  const workoutsByDate = workouts.reduce<Record<string, Workout[]>>((acc, w) => {
    if (!acc[w.date]) acc[w.date] = [];
    acc[w.date].push(w);
    return acc;
  }, {});

  // Build grid cells
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);

  function openCreate(day: number) {
    setSelectedDate(toDateStr(year, month, day));
    setSheetOpen(true);
  }

  async function handleCreate(formData: FormData) {
    await createWorkout(formData);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/coach/calendar`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Calendars
        </Link>
        <div
          className="h-3 w-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: calendar.color }}
        />
        <h1 className="font-semibold text-lg">{calendar.name}</h1>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{MONTH_NAMES[month]} {year}</h2>
        <div className="flex items-center gap-1">
          <Link href={`/coach/calendar/${calendar.id}?month=${getMonthParam(prev.year, prev.month)}`}>
            <Button variant="outline" size="icon">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Link href={`/coach/calendar/${calendar.id}?month=${getMonthParam(today.getFullYear(), today.getMonth())}`}>
            <Button variant="outline" size="sm">Today</Button>
          </Link>
          <Link href={`/coach/calendar/${calendar.id}?month=${getMonthParam(next.year, next.month)}`}>
            <Button variant="outline" size="icon">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const dateStr = day ? toDateStr(year, month, day) : null;
            const dayWorkouts = dateStr ? (workoutsByDate[dateStr] ?? []) : [];
            const isToday = dateStr === todayStr;

            return (
              <div
                key={idx}
                className={`min-h-[100px] border-b border-r p-1.5 last:border-r-0 ${
                  day ? "hover:bg-muted/30 cursor-pointer" : "bg-muted/10"
                } ${isToday ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                onClick={() => day && openCreate(day)}
              >
                {day && (
                  <>
                    <span
                      className={`text-xs font-medium inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        isToday
                          ? "text-white"
                          : "text-foreground"
                      }`}
                      style={isToday ? { backgroundColor: calendar.color } : undefined}
                    >
                      {day}
                    </span>

                    <div className="mt-1 space-y-0.5">
                      {dayWorkouts.map((w) => (
                        <button
                          key={w.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/coach/calendar/${calendar.id}/workout/${w.id}`);
                          }}
                          className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1 hover:opacity-80 transition-opacity text-white"
                          style={{ backgroundColor: calendar.color }}
                        >
                          {w.is_locked && <Lock className="h-2.5 w-2.5 flex-shrink-0" />}
                          <span className="truncate">{w.title}</span>
                        </button>
                      ))}

                      {dayWorkouts.length === 0 && (
                        <div className="opacity-0 hover:opacity-100 transition-opacity">
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Plus className="h-3 w-3" /> Add
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Create workout sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New workout</SheetTitle>
          </SheetHeader>
          <form action={handleCreate} className="space-y-4 mt-4">
            <input type="hidden" name="calendar_id" value={calendar.id} />
            <input type="hidden" name="date" value={selectedDate} />

            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g. Morning Lift"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date-display">Date</Label>
              <Input
                id="date-display"
                value={selectedDate}
                readOnly
                className="text-muted-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" name="notes" placeholder="Any notes for this workout…" rows={3} />
            </div>

            <Button type="submit" className="w-full">Create &amp; open workout</Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
