"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RPE_LABELS, RPE_OPTIONS } from "@/lib/rpe";

interface RPEGateProps {
  workoutId: string;
  workoutTitle: string;
  workoutDate: string;
  athleteId: string;
}

export function RPEGate({ workoutId, workoutTitle, workoutDate, athleteId }: RPEGateProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const dateLabel = new Date(workoutDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  async function handleSubmit() {
    if (selected == null) return;
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.from("attendance").upsert(
      {
        workout_id: workoutId,
        athlete_id: athleteId,
        rpe_pre: selected,
        status: "present",
      },
      { onConflict: "workout_id,athlete_id" }
    );

    if (error) {
      toast.error("Failed to submit — try again.");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{dateLabel}</p>
          <CardTitle className="text-xl mt-1">{workoutTitle}</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            How are you feeling <span className="font-medium">before</span> this workout?
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-6 gap-2">
            {RPE_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setSelected(n)}
                className={`
                  h-12 rounded-lg text-sm font-semibold border-2 transition-all
                  ${selected === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:border-primary/50"
                  }
                `}
              >
                {n}
              </button>
            ))}
          </div>

          {selected != null && (
            <p className="text-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">RPE {selected}</span> — {RPE_LABELS[selected]}
            </p>
          )}

          <Button
            className="w-full"
            disabled={selected == null || loading}
            onClick={handleSubmit}
          >
            {loading ? "Starting…" : "Start workout"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
