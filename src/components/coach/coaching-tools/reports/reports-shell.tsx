"use client";

import { useState, useEffect, useTransition } from "react";
import {
  fetchAttendanceReport,
  fetchVolumeReport,
  fetchPRReport,
  fetchMaxProgressionReport,
  fetchRPEReport,
  type AttendanceRow,
  type VolumeWeek,
  type VolumeRow,
  type PRRow,
  type MaxPoint,
  type MaxRow,
  type RPERow,
  type RPEPoint,
} from "@/app/(coach)/coach/coaching-tools/reports/actions";
import { AttendanceReport } from "./attendance-report";
import { VolumeReport } from "./volume-report";
import { PRReport } from "./pr-report";
import { MaxProgressionReport } from "./max-progression-report";
import { RPEReport } from "./rpe-report";
import { BarChart2, TableProperties, Loader2 } from "lucide-react";

type ReportType = "attendance" | "volume" | "prs" | "maxes" | "rpe";
type DateRange = "7d" | "30d" | "90d" | "all";
type ViewMode = "chart" | "table";

interface Athlete { id: string; full_name: string }
interface Exercise { id: string; name: string }

interface Props {
  coachId: string;
  athletes: Athlete[];
  exercises: Exercise[];
}

const REPORT_TABS: { id: ReportType; label: string }[] = [
  { id: "attendance", label: "Attendance" },
  { id: "volume",     label: "Volume & Load" },
  { id: "prs",        label: "PR History" },
  { id: "maxes",      label: "Max Progression" },
  { id: "rpe",        label: "RPE Trends" },
];

const DATE_RANGES: { id: DateRange; label: string }[] = [
  { id: "7d",  label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

export function ReportsShell({ coachId, athletes, exercises }: Props) {
  const [report, setReport] = useState<ReportType>("attendance");
  const [range, setRange] = useState<DateRange>("30d");
  const [athleteId, setAthleteId] = useState("all");
  const [exerciseId, setExerciseId] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("chart");
  const [isPending, startTransition] = useTransition();

  // Data states
  const [attendanceData, setAttendanceData] = useState<AttendanceRow[] | null>(null);
  const [volumeData, setVolumeData] = useState<{ weeks: VolumeWeek[]; rows: VolumeRow[]; athleteNames: string[] } | null>(null);
  const [prData, setPrData] = useState<{ rows: PRRow[]; chartData: unknown[] } | null>(null);
  const [maxData, setMaxData] = useState<{ points: MaxPoint[]; rows: MaxRow[]; exerciseIds: string[] } | null>(null);
  const [rpeData, setRpeData] = useState<{ rows: RPERow[]; prePoints: RPEPoint[]; postPoints: RPEPoint[] } | null>(null);

  function clearData() {
    setAttendanceData(null);
    setVolumeData(null);
    setPrData(null);
    setMaxData(null);
    setRpeData(null);
  }

  useEffect(() => {
    clearData();
    startTransition(async () => {
      if (report === "attendance") {
        const d = await fetchAttendanceReport(coachId, range, athleteId);
        setAttendanceData(d);
      } else if (report === "volume") {
        const d = await fetchVolumeReport(coachId, range, athleteId);
        setVolumeData(d);
      } else if (report === "prs") {
        const d = await fetchPRReport(coachId, range, athleteId);
        setPrData(d);
      } else if (report === "maxes") {
        const d = await fetchMaxProgressionReport(coachId, athleteId, exerciseId);
        setMaxData(d);
      } else if (report === "rpe") {
        const d = await fetchRPEReport(coachId, range, athleteId);
        setRpeData(d);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, range, athleteId, exerciseId, coachId]);

  return (
    <div className="space-y-5">
      {/* ── Report type tabs ── */}
      <div className="flex flex-wrap gap-1 border-b">
        {REPORT_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setReport(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              report === id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date range */}
        <div className="flex rounded-md border overflow-hidden text-sm">
          {DATE_RANGES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setRange(id)}
              className={`px-3 py-1.5 transition-colors ${
                range === id
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Athlete filter */}
        <select
          value={athleteId}
          onChange={(e) => setAthleteId(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All athletes</option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>{a.full_name}</option>
          ))}
        </select>

        {/* Exercise filter (maxes only) */}
        {report === "maxes" && (
          <select
            value={exerciseId}
            onChange={(e) => setExerciseId(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All exercises</option>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}

        {/* Chart / Table toggle */}
        <div className="flex rounded-md border overflow-hidden text-sm ml-auto">
          <button
            onClick={() => setViewMode("chart")}
            className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
              viewMode === "chart"
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Chart
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
              viewMode === "table"
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <TableProperties className="h-3.5 w-3.5" />
            Table
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {isPending ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <>
          {report === "attendance" && attendanceData && (
            <AttendanceReport data={attendanceData} viewMode={viewMode} />
          )}
          {report === "volume" && volumeData && (
            <VolumeReport
              weeks={volumeData.weeks}
              rows={volumeData.rows}
              athleteNames={volumeData.athleteNames}
              viewMode={viewMode}
            />
          )}
          {report === "prs" && prData && (
            <PRReport rows={prData.rows} viewMode={viewMode} />
          )}
          {report === "maxes" && maxData && (
            <MaxProgressionReport
              points={maxData.points}
              rows={maxData.rows}
              viewMode={viewMode}
            />
          )}
          {report === "rpe" && rpeData && (
            <RPEReport
              rows={rpeData.rows}
              prePoints={rpeData.prePoints}
              postPoints={rpeData.postPoints}
              viewMode={viewMode}
            />
          )}
        </>
      )}
    </div>
  );
}
