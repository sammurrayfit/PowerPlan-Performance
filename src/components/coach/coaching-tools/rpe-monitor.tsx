"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RPE_LABELS } from "@/lib/rpe";

interface AthleteRPE {
  athleteId: string;
  athleteName: string;
  workoutTitle: string;
  rpe_pre: number | null;
  rpe_post: number | null;
}

interface Props {
  calendarIds: string[];
  athletes: { id: string; full_name: string }[];
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const REFRESH_MS = 30_000;

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function RPEBadge({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      {value != null ? (
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold tabular-nums">{value}</span>
          <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[80px]">
            {RPE_LABELS[value]}
          </span>
        </div>
      ) : (
        <span className="text-xl font-light text-muted-foreground/40">—</span>
      )}
    </div>
  );
}

export function RPEMonitor({ calendarIds, athletes }: Props) {
  const [date, setDate] = useState(todayISO);
  const [workoutIds, setWorkoutIds] = useState<string[]>([]);
  const [rows, setRows] = useState<AthleteRPE[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const load = useCallback(async () => {
    if (calendarIds.length === 0 || athletes.length === 0) {
      setInitialLoading(false);
      return;
    }
    setRefreshing(true);
    const supabase = createClient();
    const athleteIds = athletes.map((a) => a.id);

    const { data: workouts } = await supabase
      .from("workouts")
      .select("id, title")
      .in("calendar_id", calendarIds)
      .eq("date", date)
      .order("title");

    const ids = (workouts ?? []).map((w) => w.id);
    const titles = Object.fromEntries((workouts ?? []).map((w) => [w.id, w.title]));
    setWorkoutIds(ids);

    if (ids.length === 0) {
      setRows([]);
      setLastRefresh(new Date());
      setRefreshing(false);
      setInitialLoading(false);
      return;
    }

    const { data } = await supabase
      .from("attendance")
      .select("athlete_id, workout_id, rpe_pre, rpe_post")
      .in("workout_id", ids)
      .in("athlete_id", athleteIds);

    const nameMap = Object.fromEntries(athletes.map((a) => [a.id, a.full_name]));

    // One row per athlete per workout — keep all, sorted by pre desc then name
    const built: AthleteRPE[] = (data ?? []).map((r) => ({
      athleteId: r.athlete_id,
      athleteName: nameMap[r.athlete_id] ?? r.athlete_id,
      workoutTitle: titles[r.workout_id] ?? "Workout",
      rpe_pre: r.rpe_pre,
      rpe_post: r.rpe_post,
    }));

    built.sort((a, b) => {
      // Athletes who haven't submitted float to bottom
      if (a.rpe_pre == null && b.rpe_pre != null) return 1;
      if (a.rpe_pre != null && b.rpe_pre == null) return -1;
      return a.athleteName.localeCompare(b.athleteName);
    });

    setRows(built);
    setLastRefresh(new Date());
    setRefreshing(false);
    setInitialLoading(false);
  }, [calendarIds, athletes, date]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Athletes who haven't submitted anything yet
  const submittedIds = new Set(rows.map((r) => r.athleteId));
  const pending = athletes.filter((a) => !submittedIds.has(a.id));
  const isToday = date === todayISO();

  const dateNav = (
    <div className="flex items-center gap-1.5">
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDate((d) => shiftDate(d, -1))} title="Previous day">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Input
        type="date"
        value={date}
        onChange={(e) => e.target.value && setDate(e.target.value)}
        className="h-8 text-sm w-[9.5rem]"
      />
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDate((d) => shiftDate(d, 1))} title="Next day">
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!isToday && (
        <Button variant="outline" size="sm" className="h-8" onClick={() => setDate(todayISO())}>
          Today
        </Button>
      )}
    </div>
  );

  if (initialLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          {dateNav}
        </div>
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-muted rounded w-48" />
          {athletes.slice(0, 3).map((a) => (
            <div key={a.id} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (workoutIds.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          {dateNav}
        </div>
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-xl">
          <p className="font-medium">No workouts scheduled for {isToday ? "today" : date}</p>
          <p className="text-sm mt-1">Add a workout to a calendar for this date.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {dateNav}
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {rows.length} of {athletes.length} athlete{athletes.length !== 1 ? "s" : ""} submitted
            {lastRefresh && (
              <span className="ml-2 text-xs">· updated {timeAgo(lastRefresh.toISOString())}</span>
            )}
          </p>
          <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Submitted athletes */}
      {rows.length > 0 && (
        <div className="rounded-lg border divide-y">
          {rows.map((row) => (
            <div key={`${row.athleteId}-${row.workoutTitle}`} className="flex items-center gap-4 px-4 py-3">
              {/* Avatar + name */}
              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                {row.athleteName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{row.athleteName}</p>
                <p className="text-xs text-muted-foreground truncate">{row.workoutTitle}</p>
              </div>

              {/* RPE values */}
              <div className="flex items-start gap-6">
                <RPEBadge label="Pre" value={row.rpe_pre} />
                <RPEBadge label="Post" value={row.rpe_post} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Waiting on */}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Waiting on ({pending.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {pending.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm text-muted-foreground"
              >
                <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                  {a.full_name.charAt(0).toUpperCase()}
                </span>
                {a.full_name}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Auto-refreshes every 30 seconds
      </p>
    </div>
  );
}
