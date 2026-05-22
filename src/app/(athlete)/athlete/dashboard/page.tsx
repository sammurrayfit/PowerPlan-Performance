import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/types";

type WorkoutRow = Database["public"]["Tables"]["workouts"]["Row"];
type CalendarRow = Database["public"]["Tables"]["calendars"]["Row"];

export default async function AthleteDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().split("T")[0];

  const { data: memberships } = await supabase
    .from("team_memberships")
    .select("*")
    .eq("athlete_id", user.id);

  const teamIds = (memberships ?? []).map((m) => m.team_id);
  let todayWorkouts: WorkoutRow[] = [];
  let calendarMap: Record<string, CalendarRow> = {};

  if (teamIds.length > 0) {
    const { data: calendarRows } = await supabase
      .from("calendars")
      .select("*")
      .in("team_id", teamIds);

    const calendars = calendarRows ?? [];
    calendarMap = Object.fromEntries(calendars.map((c) => [c.id, c]));
    const calendarIds = calendars.map((c) => c.id);

    if (calendarIds.length > 0) {
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .eq("date", today)
        .in("calendar_id", calendarIds)
        .order("created_at");
      todayWorkouts = data ?? [];
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Today</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {todayWorkouts.length > 0 ? (
        <div className="space-y-3">
          {todayWorkouts.map((workout) => (
            <Card key={workout.id} className="cursor-pointer hover:bg-accent/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{workout.title}</CardTitle>
                  {workout.is_locked && <Badge variant="secondary">Locked</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {calendarMap[workout.calendar_id]?.name}
                </p>
              </CardHeader>
              {workout.notes && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{workout.notes}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>No workouts scheduled for today.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
