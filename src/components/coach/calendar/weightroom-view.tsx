"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wifi } from "lucide-react";

interface WorkoutExercise {
  id: string;
  sort_order: number;
  sets: number;
  name: string;
}

interface Athlete {
  id: string;
  full_name: string;
}

interface Log {
  id: string;
  workout_exercise_id: string;
  athlete_id: string;
  set_number: number;
}

interface Props {
  workout: { id: string; title: string; date: string; is_locked: boolean };
  exercises: WorkoutExercise[];
  athletes: Athlete[];
  initialLogs: Log[];
  workoutId: string;
  calendarId: string;
}

function initProgress(logs: Log[], exercises: WorkoutExercise[], athletes: Athlete[]) {
  const map: Record<string, Record<string, Set<number>>> = {};
  for (const a of athletes) {
    map[a.id] = {};
    for (const e of exercises) map[a.id][e.id] = new Set();
  }
  for (const l of logs) {
    if (map[l.athlete_id]?.[l.workout_exercise_id]) {
      map[l.athlete_id][l.workout_exercise_id].add(l.set_number);
    }
  }
  return map;
}

function SetDots({ completed, total }: { completed: number; total: number }) {
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full border transition-colors ${
            i < completed ? "bg-green-500 border-green-500" : "border-border bg-muted/50"
          }`}
        />
      ))}
    </div>
  );
}

export function WeightroomView({ workout, exercises, athletes, initialLogs, workoutId, calendarId }: Props) {
  const [progress, setProgress] = useState(() => initProgress(initialLogs, exercises, athletes));
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`weightroom-${workoutId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exercise_logs",
          filter: `workout_id=eq.${workoutId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const log = payload.new as Log;
            setProgress((prev) => {
              const next = { ...prev };
              if (!next[log.athlete_id]) next[log.athlete_id] = {};
              if (!next[log.athlete_id][log.workout_exercise_id]) {
                next[log.athlete_id][log.workout_exercise_id] = new Set();
              }
              next[log.athlete_id] = { ...next[log.athlete_id] };
              next[log.athlete_id][log.workout_exercise_id] = new Set([
                ...next[log.athlete_id][log.workout_exercise_id],
                log.set_number,
              ]);
              return { ...next };
            });
          }
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workoutId]);

  const dateLabel = new Date(workout.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (athletes.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href={`/coach/calendar/${calendarId}/workout/${workoutId}`} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{workout.title}</h1>
            <p className="text-sm text-muted-foreground">{dateLabel}</p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">No athletes are assigned to this calendar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/coach/calendar/${calendarId}/workout/${workoutId}`} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{workout.title}</h1>
            <p className="text-sm text-muted-foreground">{dateLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Wifi className={`h-3.5 w-3.5 ${connected ? "text-green-500" : "text-muted-foreground"}`} />
          <span className={connected ? "text-green-500" : "text-muted-foreground"}>
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full min-w-max text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left font-medium text-muted-foreground py-2 pr-4 min-w-[120px] sticky left-0 bg-background">
                Athlete
              </th>
              {exercises.map((ex) => (
                <th
                  key={ex.id}
                  className="text-center font-medium text-muted-foreground py-2 px-3 min-w-[100px]"
                >
                  <span className="block truncate max-w-[100px]" title={ex.name}>
                    {ex.name}
                  </span>
                  <span className="text-xs font-normal">{ex.sets}s</span>
                </th>
              ))}
              <th className="text-center font-medium text-muted-foreground py-2 px-3">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {athletes.map((athlete) => {
              const totalCompleted = exercises.reduce(
                (sum, ex) => sum + (progress[athlete.id]?.[ex.id]?.size ?? 0),
                0
              );
              const totalSets = exercises.reduce((sum, ex) => sum + ex.sets, 0);
              const pct = totalSets > 0 ? Math.round((totalCompleted / totalSets) * 100) : 0;

              return (
                <tr key={athlete.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 pr-4 sticky left-0 bg-background">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                        {athlete.full_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium truncate max-w-[90px]">{athlete.full_name}</span>
                    </div>
                  </td>

                  {exercises.map((ex) => {
                    const done = progress[athlete.id]?.[ex.id]?.size ?? 0;
                    return (
                      <td key={ex.id} className="py-3 px-3 text-center">
                        <SetDots completed={done} total={ex.sets} />
                        {done > 0 && (
                          <span className="text-xs text-muted-foreground block mt-0.5">
                            {done}/{ex.sets}
                          </span>
                        )}
                      </td>
                    );
                  })}

                  <td className="py-3 px-3 text-center">
                    <Badge
                      variant={pct === 100 ? "default" : "outline"}
                      className={pct === 100 ? "bg-green-500 hover:bg-green-500" : ""}
                    >
                      {pct}%
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
