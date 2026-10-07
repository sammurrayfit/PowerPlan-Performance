"use client";

import { useState, useEffect } from "react";
import {
  fetchAttendanceReport,
  fetchCompletedWorkouts,
  fetchVolumeReport,
  fetchPRReport,
  fetchMaxProgressionReport,
  fetchRPEReport,
  type AttendanceRow,
  type CompletedWorkoutRow,
  type VolumeWeek,
  type VolumeAthlete,
  type VolumeRow,
  type PRRow,
  type MaxRow,
  type RPERow,
} from "@/app/(coach)/coach/coaching-tools/reports/actions";
import { AttendanceReport } from "./attendance-report";
import { CompletedWorkoutsReport } from "./completed-workouts-report";
import { VolumeReport } from "./volume-report";
import { PRReport } from "./pr-report";
import { MaxProgressionReport } from "./max-progression-report";
import { RPEReport } from "./rpe-report";
import { Loader2, CalendarCheck, ClipboardCheck, Dumbbell, Trophy, TrendingUp, Activity, X } from "lucide-react";

type ReportType = "attendance" | "completed" | "volume" | "prs" | "maxes" | "rpe";
type DateRange = "7d" | "30d" | "90d" | "all";

export type ReportFilters = {
  report: ReportType;
  range: DateRange;
  date: string;      // completed workouts only: a single day, overrides range
  team: string;      // "all" or team id
  athlete: string;   // "all" or athlete id
  exercise: string;  // maxes only: "all" or exercise id
};

interface Athlete { id: string; full_name: string }
interface Exercise { id: string; name: string }
interface Team { id: string; name: string; athleteIds: string[] }

interface Props {
  coachId: string;
  athletes: Athlete[];
  teams: Team[];
  exercises: Exercise[];
  initial: Partial<ReportFilters>;
}

const REPORT_TABS: { id: ReportType; label: string; icon: typeof Activity }[] = [
  { id: "completed",  label: "Completed Workouts", icon: ClipboardCheck },
  { id: "volume",     label: "Volume & Load",      icon: Dumbbell },
  { id: "prs",        label: "PR History",         icon: Trophy },
  { id: "maxes",      label: "Max Progression",    icon: TrendingUp },
  { id: "rpe",        label: "RPE Trends",         icon: Activity },
  { id: "attendance", label: "Attendance",         icon: CalendarCheck },
];

const DATE_RANGES: { id: DateRange; label: string }[] = [
  { id: "7d",  label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

const DEFAULTS: ReportFilters = { report: "completed", range: "30d", date: "", team: "all", athlete: "all", exercise: "all" };

type ReportData =
  | { report: "attendance"; data: AttendanceRow[] }
  | { report: "completed"; data: CompletedWorkoutRow[] }
  | { report: "volume"; data: { weeks: VolumeWeek[]; athletes: VolumeAthlete[]; rows: VolumeRow[] } }
  | { report: "prs"; data: PRRow[] }
  | { report: "maxes"; data: MaxRow[] }
  | { report: "rpe"; data: RPERow[] };

async function load(coachId: string, f: ReportFilters): Promise<ReportData> {
  const team = f.team === "all" ? null : f.team;
  switch (f.report) {
    case "attendance": return { report: "attendance", data: await fetchAttendanceReport(coachId, f.range, f.athlete, team) };
    case "completed":  return { report: "completed", data: await fetchCompletedWorkouts(coachId, f.range, f.athlete, f.date || null, team) };
    case "volume":     return { report: "volume", data: await fetchVolumeReport(coachId, f.range, f.athlete, team) };
    case "prs":        return { report: "prs", data: await fetchPRReport(coachId, f.range, f.athlete, team) };
    case "maxes":      return { report: "maxes", data: await fetchMaxProgressionReport(coachId, f.athlete, f.exercise, team) };
    case "rpe":        return { report: "rpe", data: await fetchRPEReport(coachId, f.range, f.athlete, team) };
  }
}

const selectClass = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm max-w-[14rem]";

function Segmented<T extends string>({ options, value, onChange, disabled }: {
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-lg border p-0.5 text-sm ${disabled ? "opacity-50" : ""}`}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1 transition-colors ${
            value === o.id ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ReportsShell({ coachId, athletes, teams, exercises, initial }: Props) {
  const [filters, setFilters] = useState<ReportFilters>(() => {
    const f = { ...DEFAULTS };
    for (const [k, v] of Object.entries(initial)) if (v) (f as Record<string, string>)[k] = v;
    if (!REPORT_TABS.some((t) => t.id === f.report)) f.report = DEFAULTS.report;
    if (!DATE_RANGES.some((r) => r.id === f.range)) f.range = DEFAULTS.range;
    return f;
  });
  const [result, setResult] = useState<ReportData | null>(null);
  // The filters the last settled request was for; loading until it matches.
  const [settled, setSettled] = useState<{ filters: ReportFilters; error: boolean } | null>(null);
  const loading = settled?.filters !== filters;
  const error = !loading && !!settled?.error;

  const update = (patch: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const team = teams.find((t) => t.id === filters.team);
  const athleteOptions = team ? athletes.filter((a) => team.athleteIds.includes(a.id)) : athletes;

  // Keep the URL in step so a report can be bookmarked or refreshed.
  useEffect(() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== DEFAULTS[k as keyof ReportFilters]) params.set(k, v);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filters]);

  // Fetch on every filter change. The previous result stays on screen (dimmed)
  // until the new one lands, and responses to superseded requests are dropped.
  useEffect(() => {
    let stale = false;
    load(coachId, filters)
      .then((r) => { if (!stale) { setResult(r); setSettled({ filters, error: false }); } })
      .catch(() => { if (!stale) setSettled({ filters, error: true }); });
    return () => { stale = true; };
  }, [coachId, filters]);

  function setTeam(teamId: string) {
    const t = teams.find((x) => x.id === teamId);
    const keepAthlete = filters.athlete === "all" || !t || t.athleteIds.includes(filters.athlete);
    update({ team: teamId, athlete: keepAthlete ? filters.athlete : "all" });
  }

  const showRange = filters.report !== "maxes";
  const current = result?.report === filters.report ? result : null;

  return (
    <div className="space-y-5">
      {/* ── Report type tabs ── */}
      <div className="flex gap-1 overflow-x-auto border-b -mx-1 px-1">
        {REPORT_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => update({ report: id })}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filters.report === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Filters: who, then when ── */}
      <div className="flex flex-wrap items-center gap-2">
        {teams.length > 0 && (
          <select value={filters.team} onChange={(e) => setTeam(e.target.value)} className={selectClass} aria-label="Team">
            <option value="all">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select value={filters.athlete} onChange={(e) => update({ athlete: e.target.value })} className={selectClass} aria-label="Athlete">
          <option value="all">{team ? `All ${team.name} athletes` : "All athletes"}</option>
          {athleteOptions.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
        </select>
        {filters.report === "maxes" && (
          <select value={filters.exercise} onChange={(e) => update({ exercise: e.target.value })} className={selectClass} aria-label="Exercise">
            <option value="all">All exercises</option>
            {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {showRange && (
            <Segmented
              options={DATE_RANGES}
              value={filters.date && filters.report === "completed" ? null : filters.range}
              onChange={(range) => update({ range, date: "" })}
              disabled={!!filters.date && filters.report === "completed"}
            />
          )}
          {filters.report === "completed" && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={filters.date}
                onChange={(e) => update({ date: e.target.value })}
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                aria-label="Specific day"
              />
              {filters.date && (
                <button onClick={() => update({ date: "" })} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted" title="Clear day">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <Loader2 className={`h-4 w-4 animate-spin text-muted-foreground transition-opacity ${loading ? "opacity-100" : "opacity-0"}`} />
        </div>
      </div>

      {/* ── Content ── */}
      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 py-10 text-center text-sm text-destructive">
          Couldn&apos;t load this report. Try again or change the filters.
        </div>
      ) : !current ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <div className={`transition-opacity ${loading ? "opacity-50 pointer-events-none" : ""}`}>
          {current.report === "attendance" && <AttendanceReport data={current.data} />}
          {current.report === "completed" && <CompletedWorkoutsReport rows={current.data} summary />}
          {current.report === "volume" && <VolumeReport {...current.data} />}
          {current.report === "prs" && <PRReport rows={current.data} />}
          {current.report === "maxes" && (
            <MaxProgressionReport rows={current.data} singleAthlete={filters.athlete !== "all"} singleExercise={filters.exercise !== "all"} />
          )}
          {current.report === "rpe" && <RPEReport rows={current.data} />}
        </div>
      )}
    </div>
  );
}
