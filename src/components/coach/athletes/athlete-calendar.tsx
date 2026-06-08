"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CalendarWorkout = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  calendar_id: string;
  calendarName: string;
  calendarColor: string;
};

interface AthleteCalendarProps {
  athleteId: string;
  workouts: CalendarWorkout[];
  view: "month" | "week" | "day";
  focusDate: string; // YYYY-MM-DD
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function parseDate(str: string) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

// ─── Shared nav helpers ──────────────────────────────────────────────────────

function buildUrl(athleteId: string, view: string, date: string) {
  return `/coach/athletes/${athleteId}?view=${view}&date=${date}`;
}

// ─── View toggle ─────────────────────────────────────────────────────────────

function ViewToggle({ athleteId, view, focusDate }: { athleteId: string; view: string; focusDate: string }) {
  const views = ["month", "week", "day"] as const;
  return (
    <div className="flex rounded-md border overflow-hidden text-sm">
      {views.map((v) => (
        <Link
          key={v}
          href={buildUrl(athleteId, v, focusDate)}
          className={`px-3 py-1.5 capitalize transition-colors ${
            view === v
              ? "bg-foreground text-background font-medium"
              : "hover:bg-muted text-muted-foreground"
          }`}
        >
          {v}
        </Link>
      ))}
    </div>
  );
}

// ─── Workout pill ─────────────────────────────────────────────────────────────

function WorkoutPill({ workout }: { workout: CalendarWorkout }) {
  return (
    <Link
      href={`/coach/calendar/${workout.calendar_id}/workout/${workout.id}`}
      onClick={(e) => e.stopPropagation()}
      className="block w-full text-left text-xs px-1.5 py-0.5 rounded truncate text-white hover:opacity-80 transition-opacity"
      style={{ backgroundColor: workout.calendarColor }}
    >
      {workout.title}
    </Link>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({ athleteId, workouts, view, focusDate }: AthleteCalendarProps) {
  const router = useRouter();
  const focus = parseDate(focusDate);
  const year = focus.getFullYear();
  const month = focus.getMonth();

  const workoutsByDate = workouts.reduce<Record<string, CalendarWorkout[]>>((acc, w) => {
    if (!acc[w.date]) acc[w.date] = [];
    acc[w.date].push(w);
    return acc;
  }, {});

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = toDateStr(new Date());

  const prevDate = new Date(year, month - 1, 1);
  const nextDate = new Date(year, month + 1, 1);

  return (
    <>
      {/* Nav */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{MONTH_NAMES[month]} {year}</h2>
        <div className="flex items-center gap-1">
          <Link href={buildUrl(athleteId, view, toDateStr(prevDate))}>
            <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
          </Link>
          <Link href={buildUrl(athleteId, view, todayStr)}>
            <Button variant="outline" size="sm">Today</Button>
          </Link>
          <Link href={buildUrl(athleteId, view, toDateStr(nextDate))}>
            <Button variant="outline" size="icon"><ChevronRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-lg border overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const dateStr = day
              ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
              : null;
            const dayWorkouts = dateStr ? (workoutsByDate[dateStr] ?? []) : [];
            const isToday = dateStr === todayStr;

            return (
              <div
                key={idx}
                onClick={() => day && router.push(buildUrl(athleteId, "day", dateStr!))}
                className={`min-h-[100px] border-b border-r p-1.5 last:border-r-0 ${
                  day ? "hover:bg-muted/30 cursor-pointer" : "bg-muted/10"
                } ${isToday ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
              >
                {day && (
                  <>
                    <span
                      className="text-xs font-medium inline-flex h-6 w-6 items-center justify-center rounded-full"
                      style={isToday ? { backgroundColor: "#7c3aed", color: "#ffffff" } : undefined}
                    >
                      {day}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayWorkouts.map((w) => (
                        <WorkoutPill key={w.id} workout={w} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({ athleteId, workouts, view, focusDate }: AthleteCalendarProps) {
  const focus = parseDate(focusDate);
  const weekStart = startOfWeek(focus);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const workoutsByDate = workouts.reduce<Record<string, CalendarWorkout[]>>((acc, w) => {
    if (!acc[w.date]) acc[w.date] = [];
    acc[w.date].push(w);
    return acc;
  }, {});

  const todayStr = toDateStr(new Date());
  const prevWeekDate = toDateStr(addDays(weekStart, -7));
  const nextWeekDate = toDateStr(addDays(weekStart, 7));

  const weekLabel = (() => {
    const s = days[0];
    const e = days[6];
    if (s.getMonth() === e.getMonth()) {
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  })();

  return (
    <>
      {/* Nav */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{weekLabel}</h2>
        <div className="flex items-center gap-1">
          <Link href={buildUrl(athleteId, view, prevWeekDate)}>
            <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
          </Link>
          <Link href={buildUrl(athleteId, view, todayStr)}>
            <Button variant="outline" size="sm">Today</Button>
          </Link>
          <Link href={buildUrl(athleteId, view, nextWeekDate)}>
            <Button variant="outline" size="icon"><ChevronRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </div>

      {/* 7-column grid */}
      <div className="rounded-lg border overflow-hidden">
        <div className="grid grid-cols-7 border-b">
          {days.map((day) => {
            const dateStr = toDateStr(day);
            const isToday = dateStr === todayStr;
            return (
              <div
                key={dateStr}
                className={`py-2 text-center border-r last:border-r-0 ${isToday ? "bg-blue-50 dark:bg-blue-950/20" : "bg-muted/50"}`}
              >
                <p className="text-xs text-muted-foreground">{DAY_HEADERS[day.getDay()]}</p>
                <span
                  className="text-sm font-semibold inline-flex h-7 w-7 items-center justify-center rounded-full mx-auto mt-0.5"
                  style={isToday ? { backgroundColor: "#7c3aed", color: "#ffffff" } : undefined}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7 min-h-[160px]">
          {days.map((day) => {
            const dateStr = toDateStr(day);
            const dayWorkouts = workoutsByDate[dateStr] ?? [];
            const isToday = dateStr === todayStr;
            return (
              <Link
                key={dateStr}
                href={buildUrl(athleteId, "day", dateStr)}
                className={`p-1.5 border-r last:border-r-0 space-y-0.5 block hover:bg-muted/30 transition-colors ${
                  isToday ? "bg-blue-50 dark:bg-blue-950/20" : ""
                }`}
              >
                {dayWorkouts.map((w) => (
                  <WorkoutPill key={w.id} workout={w} />
                ))}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Day view ─────────────────────────────────────────────────────────────────

function DayView({ athleteId, workouts, view, focusDate }: AthleteCalendarProps) {
  const focus = parseDate(focusDate);
  const todayStr = toDateStr(new Date());
  const isToday = focusDate === todayStr;

  const prevDate = toDateStr(addDays(focus, -1));
  const nextDate = toDateStr(addDays(focus, 1));

  const dayWorkouts = workouts.filter((w) => w.date === focusDate);

  const label = focus.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      {/* Nav */}
      <div className="flex items-center justify-between">
        <h2 className={`text-lg font-bold ${isToday ? "text-blue-600 dark:text-blue-400" : ""}`}>
          {label}
          {isToday && <span className="ml-2 text-sm font-normal text-muted-foreground">Today</span>}
        </h2>
        <div className="flex items-center gap-1">
          <Link href={buildUrl(athleteId, view, prevDate)}>
            <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
          </Link>
          <Link href={buildUrl(athleteId, view, todayStr)}>
            <Button variant="outline" size="sm">Today</Button>
          </Link>
          <Link href={buildUrl(athleteId, view, nextDate)}>
            <Button variant="outline" size="icon"><ChevronRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </div>

      {/* Day content */}
      {dayWorkouts.length === 0 ? (
        <div className="rounded-lg border bg-muted/20 py-16 text-center text-muted-foreground">
          <Dumbbell className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No workouts scheduled</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayWorkouts.map((w) => (
            <Link
              key={w.id}
              href={`/coach/calendar/${w.calendar_id}/workout/${w.id}`}
              className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3 hover:border-foreground/20 hover:bg-muted/30 transition-colors"
            >
              <div
                className="h-10 w-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: w.calendarColor }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{w.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{w.calendarName}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AthleteCalendar(props: AthleteCalendarProps) {
  const { athleteId, view, focusDate } = props;

  return (
    <div className="space-y-4">
      {/* Header row: title + view toggle */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Schedule</h3>
        <ViewToggle athleteId={athleteId} view={view} focusDate={focusDate} />
      </div>

      {view === "month" && <MonthView {...props} />}
      {view === "week" && <WeekView {...props} />}
      {view === "day" && <DayView {...props} />}
    </div>
  );
}
