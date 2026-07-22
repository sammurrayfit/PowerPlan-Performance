import { createClient } from "@/lib/supabase/server";
import { getEffectiveCoachId } from "@/lib/supabase/coach";
import { AthleteKiosk } from "@/components/coach/weightroom/athlete-kiosk";
import { DateNav } from "@/components/coach/weightroom/date-nav";

interface Props {
  searchParams: Promise<{ date?: string }>;
}

export default async function WeightroomPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const effectiveCoachId = await getEffectiveCoachId(supabase, user.id);

  const today = new Date().toISOString().split("T")[0];
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  const { data: calendars } = await supabase
    .from("calendars")
    .select("id, name, team_id, athlete_id")
    .eq("coach_id", effectiveCoachId);

  if (!calendars || calendars.length === 0) {
    return (
      <div className="space-y-4">
        <DateNav date={date} today={today} />
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
          <p>No calendars yet. Create a calendar to get started.</p>
        </div>
      </div>
    );
  }

  const calendarIds = calendars.map((c) => c.id);
  const { data: workouts } = await supabase
    .from("workouts")
    .select("id, title, date, calendar_id")
    .in("calendar_id", calendarIds)
    .eq("date", date)
    .order("title");

  const teamIds = calendars.map((c) => c.team_id).filter(Boolean) as string[];
  const directAthleteIds = calendars.map((c) => c.athlete_id).filter(Boolean) as string[];

  const { data: memberships } = teamIds.length > 0
    ? await supabase.from("team_memberships").select("team_id, athlete_id").in("team_id", teamIds)
    : { data: [] };

  const allAthleteIds = [
    ...new Set([
      ...(memberships ?? []).map((m) => m.athlete_id),
      ...directAthleteIds,
    ]),
  ];

  const { data: allProfiles } = allAthleteIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", allAthleteIds).order("full_name")
    : { data: [] };

  const calendarAthletes: Record<string, string[]> = {};
  for (const cal of calendars) {
    const ids: string[] = [];
    if (cal.team_id) {
      const teamMembers = (memberships ?? [])
        .filter((m) => m.team_id === cal.team_id)
        .map((m) => m.athlete_id);
      ids.push(...teamMembers);
    }
    if (cal.athlete_id) ids.push(cal.athlete_id);
    calendarAthletes[cal.id] = [...new Set(ids)];
  }

  // Group workouts by title — per-athlete calendars create one workout per athlete,
  // so we merge them into a single entry per program with a per-athlete workout ID map.
  const groupMap = new Map<string, {
    id: string;
    title: string;
    date: string;
    calendarId: string;
    athleteIds: string[];
    workoutIdByAthlete: Record<string, string>;
  }>();

  for (const w of workouts ?? []) {
    if (w.title === "Pre-Activation") continue;
    const athletes = calendarAthletes[w.calendar_id] ?? [];
    if (!groupMap.has(w.title)) {
      groupMap.set(w.title, {
        id: w.id,
        title: w.title,
        date: w.date,
        calendarId: w.calendar_id,
        athleteIds: [],
        workoutIdByAthlete: {},
      });
    }
    const group = groupMap.get(w.title)!;
    for (const athleteId of athletes) {
      if (!group.athleteIds.includes(athleteId)) {
        group.athleteIds.push(athleteId);
        group.workoutIdByAthlete[athleteId] = w.id;
      }
    }
  }

  const mergedWorkouts = Array.from(groupMap.values());
  const profiles = (allProfiles ?? []) as { id: string; full_name: string }[];

  return (
    <div className="space-y-5">
      <DateNav date={date} today={today} />
      <AthleteKiosk key={date} workouts={mergedWorkouts} profiles={profiles} date={date} />
    </div>
  );
}
