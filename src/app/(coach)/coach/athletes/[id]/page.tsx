import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MaxesTable } from "@/components/coach/athletes/maxes-table";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AthleteProfilePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: athlete }, { data: maxesRaw }, { data: prsRaw }, { data: exercises }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").eq("id", id).single(),
    supabase
      .from("maxes")
      .select("id, exercise_id, value, unit, date_recorded, exercises(id, name)")
      .eq("athlete_id", id)
      .order("date_recorded", { ascending: false }),
    supabase
      .from("personal_records")
      .select("id, exercise_id, value, unit, date_achieved, exercises(id, name)")
      .eq("athlete_id", id)
      .order("date_achieved", { ascending: false }),
    supabase.from("exercises").select("id, name").order("name"),
  ]);

  if (!athlete || athlete.role !== "athlete") notFound();

  // Latest max per exercise (already sorted desc by date_recorded)
  const seenExercises = new Set<string>();
  const currentMaxes: {
    id: string;
    exercise_id: string;
    exercise_name: string;
    value: number;
    unit: string;
    date_recorded: string;
  }[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of maxesRaw ?? [] as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = (m.exercises as any)?.name ?? "Unknown";
    if (!seenExercises.has(m.exercise_id)) {
      seenExercises.add(m.exercise_id);
      currentMaxes.push({ id: m.id, exercise_id: m.exercise_id, exercise_name: name, value: Number(m.value), unit: m.unit, date_recorded: m.date_recorded });
    }
  }
  currentMaxes.sort((a, b) => a.exercise_name.localeCompare(b.exercise_name));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxHistory = (maxesRaw ?? [] as any[]).map((m: any) => ({
    id: m.id,
    exercise_id: m.exercise_id,
    exercise_name: (m.exercises as any)?.name ?? "Unknown",
    value: Number(m.value),
    unit: m.unit,
    date_recorded: m.date_recorded,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prs = (prsRaw ?? [] as any[]).map((pr: any) => ({
    id: pr.id,
    exercise_name: (pr.exercises as any)?.name ?? "Unknown",
    value: Number(pr.value),
    unit: pr.unit,
    date_achieved: pr.date_achieved,
  }));

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <Link href="/coach/athletes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Athletes
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
            {athlete.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{athlete.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              Joined {new Date(athlete.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Maxes */}
      <MaxesTable
        athleteId={id}
        currentMaxes={currentMaxes}
        maxHistory={maxHistory}
        exercises={exercises ?? []}
      />

      {/* PR History */}
      <div className="space-y-3">
        <h3 className="font-semibold">PR History</h3>
        {prs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No PRs recorded yet.</p>
        ) : (
          <div className="rounded-lg border divide-y">
            {prs.map((pr) => (
              <div key={pr.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{pr.exercise_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(pr.date_achieved).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {pr.value} {pr.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
