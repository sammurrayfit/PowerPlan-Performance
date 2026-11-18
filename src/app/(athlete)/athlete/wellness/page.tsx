import { createClient } from "@/lib/supabase/server";
import { todayNY } from "@/lib/utils";
import { WellnessShell } from "@/components/athlete/wellness-shell";

export default async function WellnessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = todayNY();

  const [{ data: checkins }, { data: nutrition }] = await Promise.all([
    supabase
      .from("mental_checkins")
      .select("*")
      .eq("athlete_id", user.id)
      .order("date", { ascending: false })
      .limit(14),
    supabase
      .from("nutrition_logs")
      .select("*")
      .eq("athlete_id", user.id)
      .order("date", { ascending: false })
      .limit(14),
  ]);

  const todayCheckin = (checkins ?? []).find((c) => c.date === today) ?? null;
  const todayNutrition = (nutrition ?? []).find((n) => n.date === today) ?? null;

  return (
    <WellnessShell
      today={today}
      todayCheckin={todayCheckin}
      todayNutrition={todayNutrition}
      recentCheckins={checkins ?? []}
      recentNutrition={nutrition ?? []}
    />
  );
}
