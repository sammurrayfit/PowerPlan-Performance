"use client";

import { useState } from "react";
import { fetchAthleteWorkoutData, saveKioskSet, saveKioskAttendance } from "@/app/(coach)/coach/weightroom/actions";
import { WorkoutLogger } from "@/components/athlete/workout-logger";
import { Maximize2, Minimize2, ArrowLeft, CheckCircle2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkoutOption {
  id: string;
  title: string;
  date: string;
  calendarId: string;
  athleteIds: string[];
  workoutIdByAthlete?: Record<string, string>;
}

interface Profile {
  id: string;
  full_name: string;
}

interface Props {
  workouts: WorkoutOption[];
  profiles: Profile[];
  date: string;
}

type ActiveSession = {
  athlete: Profile;
  workoutId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseData: any[];
  celebrating: boolean;
};

// ── Fullscreen toggle ─────────────────────────────────────────────────────────
function FullscreenButton() {
  const [isFs, setIsFs] = useState(false);
  function toggle() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFs(true));
    } else {
      document.exitFullscreen().then(() => setIsFs(false));
    }
  }
  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title={isFs ? "Exit fullscreen" : "Enter fullscreen"}
    >
      {isFs ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
    </button>
  );
}

// ── Single athlete panel ──────────────────────────────────────────────────────
function AthletePanel({
  session,
  workout,
  onDone,
  onClose,
  doneLoading,
}: {
  session: ActiveSession;
  workout: WorkoutOption;
  onDone: () => void;
  onClose: () => void;
  doneLoading: boolean;
}) {
  if (session.celebrating) {
    return (
      <div className="rounded-2xl border-2 border-green-500 bg-green-50 dark:bg-green-950/20 flex flex-col items-center justify-center gap-4 min-h-[300px] p-8 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" strokeWidth={1.5} />
        <div>
          <p className="text-2xl font-bold">
            {session.athlete.full_name.split(" ")[0]}, great work!
          </p>
          <p className="text-muted-foreground mt-1">All sets complete 🎉</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-border flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 border-b">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
            {session.athlete.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">{session.athlete.full_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{workout.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onDone}
            disabled={doneLoading}
            className="bg-green-600 hover:bg-green-700 h-8 px-3 text-xs"
          >
            {doneLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Done"
            )}
          </Button>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Workout logger */}
      <div className="overflow-y-auto">
        <WorkoutLogger
          workout={{ ...workout, id: session.workoutId, notes: null, is_locked: false }}
          exercises={session.exerciseData}
          athleteId={session.athlete.id}
          onSaveSet={saveKioskSet}
          onSaveAttendance={saveKioskAttendance}
        />
      </div>
    </div>
  );
}

// ── Main kiosk ────────────────────────────────────────────────────────────────
export function AthleteKiosk({ workouts, profiles, date }: Props) {
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutOption | null>(
    workouts.length === 1 ? workouts[0] : null
  );
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [doneLoadingIds, setDoneLoadingIds] = useState<Set<string>>(new Set());

  const today = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // Open an athlete's panel (fetch their data)
  async function handleOpen(athlete: Profile) {
    if (!selectedWorkout) return;
    if (activeSessions.some((s) => s.athlete.id === athlete.id)) return; // already open

    const workoutId = selectedWorkout.workoutIdByAthlete?.[athlete.id] ?? selectedWorkout.id;
    setLoadingIds((prev) => new Set(prev).add(athlete.id));
    try {
      const data = await fetchAthleteWorkoutData(workoutId, athlete.id);
      setActiveSessions((prev) => [
        ...prev,
        { athlete, workoutId, exerciseData: data, celebrating: false },
      ]);
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(athlete.id);
        return next;
      });
    }
  }

  // Close a panel immediately (no check)
  function handleClose(athleteId: string) {
    setActiveSessions((prev) => prev.filter((s) => s.athlete.id !== athleteId));
  }

  // Done: re-fetch → if all sets logged show celebration, else just close
  async function handleDone(athleteId: string) {
    if (!selectedWorkout) return;
    const workoutId = selectedWorkout.workoutIdByAthlete?.[athleteId] ?? selectedWorkout.id;
    setDoneLoadingIds((prev) => new Set(prev).add(athleteId));
    try {
      const fresh = await fetchAthleteWorkoutData(workoutId, athleteId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalSets = (fresh as any[]).reduce((sum, e) => sum + (e.sets ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doneSets = (fresh as any[]).reduce((sum, e) => sum + (e.logs?.length ?? 0), 0);
      const isComplete = totalSets > 0 && doneSets >= totalSets;

      if (isComplete) {
        // Show celebration in panel, then auto-close
        setActiveSessions((prev) =>
          prev.map((s) =>
            s.athlete.id === athleteId ? { ...s, celebrating: true } : s
          )
        );
        setTimeout(() => {
          setActiveSessions((prev) => prev.filter((s) => s.athlete.id !== athleteId));
        }, 2500);
      } else {
        // Not finished — just close without fanfare
        setActiveSessions((prev) => prev.filter((s) => s.athlete.id !== athleteId));
      }
    } finally {
      setDoneLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(athleteId);
        return next;
      });
    }
  }

  // ── Workout selection ───────────────────────────────────────────────────────
  if (!selectedWorkout) {
    return (
      <div className="min-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Weightroom</h1>
            <p className="text-muted-foreground mt-1">{today}</p>
          </div>
          <FullscreenButton />
        </div>
        {workouts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl text-muted-foreground">
            <p className="text-xl font-medium">No workouts scheduled for today</p>
            <p className="text-sm">Add a workout to a calendar for today&apos;s date.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-lg font-medium text-muted-foreground">Select a workout</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {workouts.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedWorkout(w)}
                  className="text-left p-6 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <p className="text-2xl font-bold">{w.title}</p>
                  <p className="text-muted-foreground mt-1">
                    {w.athleteIds.length} athlete{w.athleteIds.length !== 1 ? "s" : ""}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const workoutAthletes = profiles.filter((p) =>
    selectedWorkout.athleteIds.includes(p.id)
  );
  const activeIds = new Set(activeSessions.map((s) => s.athlete.id));
  const hasPanels = activeSessions.length > 0;

  // Panel grid columns
  const panelCols =
    activeSessions.length === 1
      ? "grid-cols-1"
      : activeSessions.length <= 4
      ? "grid-cols-1 lg:grid-cols-2"
      : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3";

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          {workouts.length > 1 && (
            <button
              onClick={() => { setSelectedWorkout(null); setActiveSessions([]); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-1 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Change workout
            </button>
          )}
          <h1 className="text-2xl font-bold">{selectedWorkout.title}</h1>
          <p className="text-muted-foreground text-sm">{today}</p>
        </div>
        <FullscreenButton />
      </div>

      {workoutAthletes.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] border-2 border-dashed rounded-2xl text-muted-foreground gap-3">
          <p className="text-xl font-medium">No athletes assigned to this calendar</p>
        </div>
      ) : (
        <>
          {/* ── Athlete name tiles ── */}
          {hasPanels ? (
            // Compact row when panels are open
            <div className="flex flex-wrap gap-2">
              {workoutAthletes.map((athlete) => {
                const isActive = activeIds.has(athlete.id);
                const isLoading = loadingIds.has(athlete.id);
                return (
                  <button
                    key={athlete.id}
                    onClick={() => handleOpen(athlete)}
                    disabled={isActive || isLoading}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                      isActive
                        ? "border-primary bg-primary/10 text-primary opacity-60 cursor-default"
                        : "border-border hover:border-primary hover:bg-primary/5"
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {athlete.full_name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    {athlete.full_name}
                    {isActive && <span className="text-xs opacity-70">· open</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            // Big tiles when nothing is open
            <>
              <p className="text-xl text-muted-foreground font-medium text-center">
                Tap your name to begin
              </p>
              <div
                className={`grid gap-5 ${
                  workoutAthletes.length <= 4
                    ? "grid-cols-2"
                    : "grid-cols-2 sm:grid-cols-3"
                }`}
              >
                {workoutAthletes.map((athlete) => {
                  const isLoading = loadingIds.has(athlete.id);
                  return (
                    <button
                      key={athlete.id}
                      onClick={() => handleOpen(athlete)}
                      disabled={isLoading}
                      className="
                        flex flex-col items-center justify-center gap-4
                        min-h-[180px] rounded-3xl border-2 border-border
                        hover:border-primary hover:bg-primary/5
                        disabled:opacity-60 disabled:cursor-wait
                        transition-all active:scale-95 select-none
                      "
                    >
                      {isLoading ? (
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      ) : (
                        <div className="h-20 w-20 rounded-full bg-primary/10 text-primary flex items-center justify-center text-4xl font-bold">
                          {athlete.full_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-bold text-xl leading-tight text-center px-3">
                        {athlete.full_name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Active athlete panels ── */}
          {hasPanels && (
            <div className={`grid gap-4 ${panelCols}`}>
              {activeSessions.map((session) => (
                <AthletePanel
                  key={session.athlete.id}
                  session={session}
                  workout={selectedWorkout}
                  onDone={() => handleDone(session.athlete.id)}
                  onClose={() => handleClose(session.athlete.id)}
                  doneLoading={doneLoadingIds.has(session.athlete.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
