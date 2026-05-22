import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Users, Dumbbell, TrendingUp } from "lucide-react";

export default async function CoachDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ count: calendarCount }, { count: exerciseCount }, { data: teams }] =
    await Promise.all([
      supabase.from("calendars").select("*", { count: "exact", head: true }).eq("coach_id", user.id),
      supabase.from("exercises").select("*", { count: "exact", head: true }).eq("created_by", user.id),
      supabase.from("teams").select("id").eq("coach_id", user.id),
    ]);

  let athleteCount = 0;
  if (teams && teams.length > 0) {
    const { count } = await supabase
      .from("team_memberships")
      .select("*", { count: "exact", head: true })
      .in("team_id", teams.map((t) => t.id));
    athleteCount = count ?? 0;
  }

  const stats = [
    { label: "Calendars",  value: calendarCount ?? 0, icon: CalendarDays },
    { label: "Athletes",   value: athleteCount,        icon: Users },
    { label: "Exercises",  value: exerciseCount ?? 0,  icon: Dumbbell },
    { label: "This week",  value: "—",                 icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, Coach.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Getting started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Add exercises to your library</p>
            <p>2. Create a calendar for your team</p>
            <p>3. Build your first workout</p>
            <p>4. Invite your athletes</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
