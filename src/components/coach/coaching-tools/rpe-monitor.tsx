"use client";

import { useState, useEffect, useCallback } from "react";
import { todayNY } from "@/lib/utils";
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
  athletes: { id: string; full_name: string; groups: string[] }[];
  ageGroups: string[];
}

function todayISO() {
  return todayNY();
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

function RPECell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground/40">—</span>;
  const tone =
    value >= 8 ? "bg-red-500/15 text-red-600 dark:text-red-400"
    : value >= 6 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
    : "bg-green-500/15 text-green-700 dark:text-green-400";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm font-bold tabular-nums ${tone}`}>
        {value}
      </span>
      <span className="hidden text-xs text-muted-foreground md:inline">{RPE_LABELS[value]}</span>
    </span>
  );
}

export function RPEMonitor({ calendarIds, athletes, ageGroups }: Props) {
  const [group, setGroup] = useState<string>("All");
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

  // Age-group filter
  const inGroup = (id: string) =>
    group === "All" || (athletes.find((a) => a.id === id)?.groups ?? []).includes(group);
  const groupsOf = (id: string) => (athletes.find((a) => a.id === id)?.groups ?? []).join(", ");
  const visibleAthletes = athletes.filter((a) => inGroup(a.id));
  const visibleRows = rows.filter((r) => inGroup(r.athleteId));

  // Athletes who haven't submitted anything yet
  const submittedIds = new Set(rows.map((r) => r.athleteId));
  const pending = visibleAthletes.filter((a) => !submittedIds.has(a.id));
  const submittedCount = new Set(visibleRows.map((r) => r.athleteId)).size;
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
            {submittedCount} of {visibleAthletes.length} athlete{visibleAthletes.length !== 1 ? "s" : ""} submitted
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

      {/* Age-group filter */}
      {ageGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-1">
            Age group
          </span>
          {["All", ...ageGroups].map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                group === g
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:border-primary/50 text-muted-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* RPE table */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5 text-left font-medium">Age group</th>
              <th className="px-4 py-2.5 text-left font-medium">Workout</th>
              <th className="px-4 py-2.5 text-left font-medium">Pre RPE</th>
              <th className="px-4 py-2.5 text-left font-medium">Post RPE</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleRows.map((row) => (
              <tr key={`${row.athleteId}-${row.workoutTitle}`}>
                <td className="px-4 py-2.5 font-medium">{row.athleteName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{groupsOf(row.athleteId) || "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.workoutTitle}</td>
                <td className="px-4 py-2.5"><RPECell value={row.rpe_pre} /></td>
                <td className="px-4 py-2.5"><RPECell value={row.rpe_post} /></td>
              </tr>
            ))}
            {pending.map((a) => (
              <tr key={a.id} className="text-muted-foreground">
                <td className="px-4 py-2.5">{a.full_name}</td>
                <td className="px-4 py-2.5">{a.groups.join(", ") || "—"}</td>
                <td className="px-4 py-2.5 italic">Not submitted</td>
                <td className="px-4 py-2.5"><RPECell value={null} /></td>
                <td className="px-4 py-2.5"><RPECell value={null} /></td>
              </tr>
            ))}
            {visibleRows.length === 0 && pending.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No athletes in {group}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Auto-refreshes every 30 seconds
      </p>
    </div>
  );
}
