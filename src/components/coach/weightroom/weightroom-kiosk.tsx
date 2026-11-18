"use client";

import { useState, useTransition, useEffect, useCallback, useMemo } from "react";
import { compareWorkoutOrder } from "@/lib/utils";
import {
  fetchAthleteWorkoutData,
  fetchMultiAthleteData,
  type AthletePanel,
} from "@/app/(coach)/coach/weightroom/actions";
import { WorkoutLogger } from "@/components/athlete/workout-logger";
import { ArrowLeft, RefreshCw, Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_ATHLETES = 6;
const REFRESH_INTERVAL_MS = 30_000;

interface WorkoutOption {
  id: string;
  title: string;
  date: string;
  calendarId: string;
  athleteIds: string[];
}

interface Profile {
  id: string;
  full_name: string;
}

interface Props {
  workouts: WorkoutOption[];
  profiles: Profile[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatLoad(
  load: number | null,
  loadType: string,
  max: number | null
): string {
  if (load === null) return "";
  if (loadType === "percent_1rm" && max) {
    return `${Math.round((load / 100) * max)} lbs`;
  }
  if (loadType === "bodyweight") return "BW";
  return `${load} lbs`;
}

// ── Athlete panel card ────────────────────────────────────────────────────────

function rpeChip(label: string, rpe: number | null) {
  if (rpe == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-input">
      {label} {rpe}/10
    </span>
  );
}

function AthleteCard({
  profile,
  panel,
  onExpand,
}: {
  profile: Profile;
  panel: AthletePanel;
  onExpand: () => void;
}) {
  const totalSets = panel.exercises.reduce((s, e) => s + (e.sets ?? 0), 0);
  const doneSets = panel.exercises.reduce((s, e) => s + e.setsCompleted, 0);
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;

  const isActive =
    panel.lastActiveAt &&
    Date.now() - new Date(panel.lastActiveAt).getTime() < 5 * 60 * 1000;

  return (
    <div
      className="rounded-xl border bg-card flex flex-col overflow-hidden cursor-pointer hover:border-foreground/30 transition-colors"
      onClick={onExpand}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base flex-shrink-0">
          {profile.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{profile.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {doneSets}/{totalSets} sets · {pct}%
          </p>
        </div>
        {/* Activity indicator */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className={`h-2 w-2 rounded-full ${
              isActive ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30"
            }`}
          />
          {panel.lastActiveAt && (
            <span className="text-xs text-muted-foreground">
              {timeAgo(panel.lastActiveAt)}
            </span>
          )}
        </div>
      </div>

      {/* RPE row — only shown when at least one value exists */}
      {(panel.rpe_pre != null || panel.rpe_post != null) && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/10 border-b">
          {rpeChip("Pre", panel.rpe_pre)}
          {rpeChip("Post", panel.rpe_post)}
        </div>
      )}

      {/* Overall progress bar */}
      <div className="h-1.5 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Exercise list */}
      <div className="flex-1 divide-y overflow-y-auto max-h-64">
        {panel.exercises.map((ex) => {
          const sets = ex.sets ?? 0;
          const done = ex.setsCompleted;
          const dots = Array.from({ length: sets });

          return (
            <div key={ex.id} className="px-4 py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ex.exercise_name}</p>
                <p className="text-xs text-muted-foreground">
                  {ex.sets && ex.reps ? `${ex.sets}×${ex.reps}` : ex.reps ?? "—"}
                  {ex.load ? ` · ${ex.load} ${ex.load_type === "bodyweight" ? "BW" : "lbs"}` : ""}
                </p>
              </div>
              {/* Set dots */}
              <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                {dots.map((_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-2.5 rounded-full border transition-colors ${
                      i < done
                        ? "bg-green-500 border-green-500"
                        : "border-muted-foreground/30"
                    }`}
                  />
                ))}
                {sets === 0 && (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          );
        })}
        {panel.exercises.length === 0 && (
          <p className="px-4 py-4 text-sm text-muted-foreground text-center">
            No exercises
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t bg-muted/20">
        <p className="text-xs text-muted-foreground text-center">
          Tap to view details →
        </p>
      </div>
    </div>
  );
}

// ── Main kiosk component ──────────────────────────────────────────────────────

export function WeightroomKiosk({ workouts, profiles }: Props) {
  type Mode = "athlete-select" | "multi-view" | "single-view";

  const [mode, setMode] = useState<Mode>("athlete-select");
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [panelData, setPanelData] = useState<AthletePanel[]>([]);
  const [singleAthlete, setSingleAthlete] = useState<Profile | null>(null);
  const [singleData, setSingleData] = useState<{ workout: WorkoutOption; exercises: unknown[] }[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ── Derived: each athlete's workouts today (Pre-Activation first) ─────────
  const workoutsByAthlete = useMemo(() => {
    const map: Record<string, WorkoutOption[]> = {};
    for (const w of [...workouts].sort(compareWorkoutOrder)) {
      for (const id of w.athleteIds) (map[id] ??= []).push(w);
    }
    return map;
  }, [workouts]);

  const todaysAthletes = profiles.filter((p) => workoutsByAthlete[p.id]?.length);

  // ── Multi-view data fetch: one request per workout, merged per athlete ────
  const loadPanelData = useCallback(
    async (athleteIds: string[]) => {
      if (athleteIds.length === 0) return;
      setRefreshing(true);
      const sorted = [...workouts].sort(compareWorkoutOrder);
      const results = await Promise.all(
        sorted.map((w) => {
          const ids = w.athleteIds.filter((id) => athleteIds.includes(id));
          return ids.length ? fetchMultiAthleteData(w.id, ids) : Promise.resolve([]);
        })
      );
      const merged = athleteIds.map((athleteId): AthletePanel => {
        const parts = results.flat().filter((p) => p.athleteId === athleteId);
        const times = parts.map((p) => p.lastActiveAt).filter(Boolean) as string[];
        return {
          athleteId,
          lastActiveAt: times.length ? times.sort().at(-1)! : null,
          rpe_pre: parts.findLast((p) => p.rpe_pre != null)?.rpe_pre ?? null,
          rpe_post: parts.findLast((p) => p.rpe_post != null)?.rpe_post ?? null,
          exercises: parts.flatMap((p) => p.exercises),
        };
      });
      setPanelData(merged);
      setLastRefresh(new Date());
      setRefreshing(false);
    },
    [workouts]
  );

  // Auto-refresh while in multi-view
  useEffect(() => {
    if (mode !== "multi-view") return;
    const id = setInterval(() => loadPanelData(selectedAthleteIds), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [mode, selectedAthleteIds, loadPanelData]);

  // ── Athlete selection toggle ──────────────────────────────────────────────
  function toggleAthlete(id: string) {
    setSelectedAthleteIds((prev) =>
      prev.includes(id)
        ? prev.filter((a) => a !== id)
        : prev.length < MAX_ATHLETES
        ? [...prev, id]
        : prev
    );
  }

  function selectAll() {
    setSelectedAthleteIds(todaysAthletes.slice(0, MAX_ATHLETES).map((a) => a.id));
  }

  // ── Enter multi-view ──────────────────────────────────────────────────────
  async function handleWatchSelected() {
    if (selectedAthleteIds.length === 0) return;
    setPanelData([]);
    setMode("multi-view");
    await loadPanelData(selectedAthleteIds);
  }

  // ── Drill into single athlete from multi-view ─────────────────────────────
  function handleExpandAthlete(athlete: Profile) {
    const athleteWorkouts = workoutsByAthlete[athlete.id] ?? [];
    startTransition(async () => {
      const data = await Promise.all(
        athleteWorkouts.map(async (w) => ({
          workout: w,
          exercises: (await fetchAthleteWorkoutData(w.id, athlete.id)) as unknown[],
        }))
      );
      setSingleData(data);
      setSingleAthlete(athlete);
      setMode("single-view");
    });
  }

  // ── Back logic ────────────────────────────────────────────────────────────
  function handleBack() {
    if (mode === "single-view") {
      setSingleAthlete(null);
      setSingleData(null);
      setMode("multi-view");
    } else if (mode === "multi-view") {
      setMode("athlete-select");
    }
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // ── 1. Name selection ─────────────────────────────────────────────────────
  if (mode === "athlete-select") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Weightroom</h1>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>

        {todaysAthletes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-xl">
            <p className="font-medium">No workouts scheduled for today</p>
            <p className="text-sm mt-1">Add a workout to a calendar for today&apos;s date.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Select a name
                <span className="ml-2 normal-case text-xs">
                  ({selectedAthleteIds.length}/{MAX_ATHLETES} selected)
                </span>
              </p>
              <button onClick={selectAll} className="text-sm text-primary hover:underline">
                Select all
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {todaysAthletes.map((athlete) => {
                const isSelected = selectedAthleteIds.includes(athlete.id);
                const isDisabled = !isSelected && selectedAthleteIds.length >= MAX_ATHLETES;
                const titles = (workoutsByAthlete[athlete.id] ?? []).map((w) => w.title);
                return (
                  <button
                    key={athlete.id}
                    onClick={() => toggleAthlete(athlete.id)}
                    disabled={isDisabled}
                    className={`
                      relative flex flex-col items-center justify-center gap-2
                      min-h-32 py-3 rounded-2xl border-2 transition-all
                      ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
                      ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}
                    `}
                  >
                    {isSelected && (
                      <span className="absolute top-2 right-2 h-5 w-5 bg-primary rounded-full flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                    )}
                    <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold">
                      {athlete.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-sm text-center px-2 leading-tight">
                      {athlete.full_name}
                    </span>
                    <span className="text-xs text-muted-foreground text-center px-2 leading-tight">
                      {titles.join(" · ")}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleWatchSelected}
                disabled={selectedAthleteIds.length === 0 || isPending}
                className="flex-1"
              >
                <Users className="h-4 w-4 mr-2" />
                {selectedAthleteIds.length <= 1
                  ? "Watch athlete"
                  : `Watch ${selectedAthleteIds.length} athletes`}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── 2. Single-athlete full logger (drill-down from multi-view) ────────────
  if (mode === "single-view" && singleAthlete && singleData) {
    return (
      <div className="space-y-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to overview
        </button>
        <h1 className="text-xl font-bold">{singleAthlete.full_name}</h1>
        {singleData.map(({ workout, exercises }) => (
          <div key={workout.id} className="space-y-2">
            {singleData.length > 1 && (
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {workout.title}
              </p>
            )}
            <WorkoutLogger
              workout={{ ...workout, notes: null, is_locked: false }}
              exercises={exercises as never[]}
              athleteId={singleAthlete.id}
            />
          </div>
        ))}
      </div>
    );
  }

  // ── 3. Multi-athlete panel view ───────────────────────────────────────────
  const cols =
    selectedAthleteIds.length <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : selectedAthleteIds.length <= 4
      ? "grid-cols-2"
      : "grid-cols-2 xl:grid-cols-3";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Weightroom · {today}</h1>
            <p className="text-sm text-muted-foreground">
              {selectedAthleteIds.length} athlete{selectedAthleteIds.length !== 1 ? "s" : ""} · watching live
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lastRefresh && (
            <p className="text-xs text-muted-foreground hidden sm:block">
              Updated {timeAgo(lastRefresh.toISOString())}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPanelData(selectedAthleteIds)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Athlete panels grid */}
      {panelData.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p>Loading…</p>
        </div>
      ) : (
        <div className={`grid gap-4 ${cols}`}>
          {panelData.map((panel) => {
            const profile = profiles.find((p) => p.id === panel.athleteId);
            if (!profile) return null;
            return (
              <AthleteCard
                key={panel.athleteId}
                profile={profile}
                panel={panel}
                onExpand={() => handleExpandAthlete(profile)}
              />
            );
          })}
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Auto-refreshes every 30 seconds · tap a card to view full details
      </p>
    </div>
  );
}
