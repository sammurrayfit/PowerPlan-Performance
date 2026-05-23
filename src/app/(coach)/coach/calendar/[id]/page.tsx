import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MonthView } from "@/components/coach/calendar/month-view";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}

export default async function CalendarPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { month } = await searchParams;

  const supabase = await createClient();

  const { data: calendar } = await supabase
    .from("calendars")
    .select("*")
    .eq("id", id)
    .single();

  if (!calendar) notFound();

  // Parse month param or default to current month
  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth();

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    year = y;
    monthIndex = m - 1;
  }

  const firstDay = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0);
  const lastDayStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const { data: workouts } = await supabase
    .from("workouts")
    .select("id, date, title, is_locked")
    .eq("calendar_id", id)
    .gte("date", firstDay)
    .lte("date", lastDayStr)
    .order("date");

  return (
    <MonthView
      calendar={calendar}
      workouts={workouts ?? []}
      year={year}
      month={monthIndex}
    />
  );
}
