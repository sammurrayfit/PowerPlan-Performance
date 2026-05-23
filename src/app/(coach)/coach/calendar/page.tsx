import { createClient } from "@/lib/supabase/server";
import { CalendarList } from "@/components/coach/calendar/calendar-list";

export default async function CalendarsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: calendars }, { data: teams }] = await Promise.all([
    supabase.from("calendars").select("*").eq("coach_id", user!.id).order("created_at"),
    supabase.from("teams").select("id, name").eq("coach_id", user!.id).order("name"),
  ]);

  return <CalendarList calendars={calendars ?? []} teams={teams ?? []} coachId={user!.id} />;
}
