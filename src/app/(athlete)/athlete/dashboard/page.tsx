import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, ChevronRight, PartyPopper } from "lucide-react";
import type { Database } from "@/lib/supabase/types";

type WorkoutRow = Database["public"]["Tables"]["workouts"]["Row"];
type CalendarRow = Database["public"]["Tables"]["calendars"]["Row"];

export default async function AthleteDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().split("T")[0];

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  const { data: memberships } = await supabase
    .from("team_memberships")
    .select("*")
    .eq("athlete_id", user.id);

  const teamIds = (memberships ?? []).map((m) => m.team_id);
  let todayWorkouts: WorkoutRow[] = [];
  let calendarMap: Record<string, CalendarRow> = {};

  // Calendars via team membership OR directly assigned to this athlete
  const calQuery = supabase.from("calendars").select("*");
  const conditions = [`athlete_id.eq.${user.id}`];
  if (teamIds.length > 0) conditions.push(`team_id.in.(${teamIds.join(",")})`);
  const { data: calendarRows } = await calQuery.or(conditions.join(","));

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
    todayWorkouts = (data ?? []).filter((w) => w.title !== "Pre-Activation");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {firstName ? `Hey, ${firstName}` : "Today"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {todayWorkouts.length > 0 ? (
        <div className="space-y-3">
          {todayWorkouts.map((workout) => {
            const color = calendarMap[workout.calendar_id]?.color ?? "var(--primary)";
            return (
              <Link key={workout.id} href={`/athlete/workout/${workout.id}`}>
                <Card
                  className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all border-l-4"
                  style={{ borderLeftColor: color }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                          style={{ backgroundColor: color }}
                        >
                          <Dumbbell className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{workout.title}</CardTitle>
                          <p className="text-xs text-muted-foreground truncate">
                            {calendarMap[workout.calendar_id]?.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {workout.is_locked && <Badge variant="secondary">Locked</Badge>}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardHeader>
                  {workout.notes && (
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground">{workout.notes}</p>
                    </CardContent>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
            <PartyPopper className="h-6 w-6 text-primary/60" />
            <p className="font-medium text-foreground">Nothing scheduled today</p>
            <p className="text-sm">Enjoy the rest day, or check the calendar for what&apos;s next.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
