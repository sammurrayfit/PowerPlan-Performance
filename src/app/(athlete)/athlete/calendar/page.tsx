import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { compareWorkoutOrder } from "@/lib/utils";

interface Props {
  searchParams: Promise<{ month?: string }>;
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function monthParam(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export default async function AthleteCalendarPage({ searchParams }: Props) {
  const { month } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth();

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    year = y;
    monthIndex = m - 1;
  }

  const firstDay = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const lastDayDate = new Date(year, monthIndex + 1, 0);
  const lastDay = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  // Get athlete's team memberships → calendars → workouts
  const { data: memberships } = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("athlete_id", user.id);

  const teamIds = (memberships ?? []).map((m) => m.team_id);
  let workouts: { id: string; date: string; title: string; is_locked: boolean; calendar_id: string }[] = [];

  {
    const conditions = [`athlete_id.eq.${user.id}`];
    if (teamIds.length > 0) conditions.push(`team_id.in.(${teamIds.join(",")})`);
    const { data: calendars } = await supabase
      .from("calendars")
      .select("id")
      .or(conditions.join(","));

    const calendarIds = (calendars ?? []).map((c) => c.id);

    if (calendarIds.length > 0) {
      const { data } = await supabase
        .from("workouts")
        .select("id, date, title, is_locked, calendar_id")
        .in("calendar_id", calendarIds)
        .gte("date", firstDay)
        .lte("date", lastDay)
        .order("date");
      workouts = (data ?? []).sort(compareWorkoutOrder);
    }
  }

  const workoutsByDate = workouts.reduce<Record<string, typeof workouts>>((acc, w) => {
    if (!acc[w.date]) acc[w.date] = [];
    acc[w.date].push(w);
    return acc;
  }, {});

  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStr = now.toISOString().split("T")[0];

  const prev = monthIndex === 0
    ? { year: year - 1, month: 11 }
    : { year, month: monthIndex - 1 };
  const next = monthIndex === 11
    ? { year: year + 1, month: 0 }
    : { year, month: monthIndex + 1 };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {MONTH_NAMES[monthIndex]} {year}
        </h1>
        <div className="flex gap-1">
          <Link
            href={`/athlete/calendar?month=${monthParam(prev.year, prev.month)}`}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link
            href="/athlete/calendar"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Today
          </Link>
          <Link
            href={`/athlete/calendar?month=${monthParam(next.year, next.month)}`}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 divide-x divide-y">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="min-h-[72px] bg-muted/10" />;

            const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === todayStr;
            const dayWorkouts = (workoutsByDate[dateStr] ?? []).filter((w) => w.title !== "Pre-Activation");

            return (
              <div
                key={dateStr}
                className="min-h-[72px] p-1.5 flex flex-col gap-1"
              >
                <span
                  className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {day}
                </span>
                {dayWorkouts.map((w) => (
                  <Link
                    key={w.id}
                    href={`/athlete/workout/${w.id}`}
                    className="block rounded px-1.5 py-0.5 text-xs font-medium truncate bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {w.title}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {workouts.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-4">
          No workouts scheduled this month.
        </p>
      )}
    </div>
  );
}
