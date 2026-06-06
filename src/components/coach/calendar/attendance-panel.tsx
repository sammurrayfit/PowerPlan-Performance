"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { upsertAttendance } from "@/app/(coach)/coach/calendar/actions";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";

type AttendanceStatus = "present" | "late" | "absent";

interface AthleteAttendance {
  athleteId: string;
  athleteName: string;
  status: AttendanceStatus | null;
  rpe_pre: number | null;
  rpe_post: number | null;
}

interface Props {
  workoutId: string;
  initialAttendance: AthleteAttendance[];
}

function rpeColor(rpe: number): string {
  if (rpe <= 3) return "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30";
  if (rpe <= 6) return "text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30";
  return "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30";
}

function StatusButton({
  active,
  status,
  onClick,
  disabled,
}: {
  active: boolean;
  status: AttendanceStatus;
  onClick: () => void;
  disabled: boolean;
}) {
  const configs = {
    present: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      label: "Present",
      activeClass: "bg-green-500 text-white border-green-500",
      inactiveClass: "text-muted-foreground border-input hover:border-green-400 hover:text-green-600",
    },
    late: {
      icon: <Clock className="w-4 h-4" />,
      label: "Late",
      activeClass: "bg-amber-500 text-white border-amber-500",
      inactiveClass: "text-muted-foreground border-input hover:border-amber-400 hover:text-amber-600",
    },
    absent: {
      icon: <XCircle className="w-4 h-4" />,
      label: "Absent",
      activeClass: "bg-red-500 text-white border-red-500",
      inactiveClass: "text-muted-foreground border-input hover:border-red-400 hover:text-red-600",
    },
  };
  const cfg = configs[status];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors disabled:opacity-50 ${
        active ? cfg.activeClass : cfg.inactiveClass
      }`}
    >
      {cfg.icon}
      {cfg.label}
    </button>
  );
}

export function AttendancePanel({ workoutId, initialAttendance }: Props) {
  const [rows, setRows] = useState<AthleteAttendance[]>(initialAttendance);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function setStatus(athleteId: string, status: AttendanceStatus) {
    setSavingId(athleteId);
    setRows((prev) => prev.map((r) => r.athleteId === athleteId ? { ...r, status } : r));
    startTransition(async () => {
      await upsertAttendance(workoutId, athleteId, { status });
      setSavingId(null);
    });
  }

  if (rows.length === 0) {
    return (
      <div className="py-6 text-center space-y-1">
        <p className="text-sm text-muted-foreground">No athletes are assigned to this calendar.</p>
        <Link href="/coach/athletes" className="text-sm text-primary hover:underline">
          Go to Athletes to assign athletes →
        </Link>
      </div>
    );
  }

  const presentCount = rows.filter((r) => r.status === "present" || r.status === "late").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Attendance · {rows.length} Athletes
        </h2>
        <span className="text-xs text-muted-foreground">
          {presentCount} present / {rows.filter((r) => r.status === "absent").length} absent
        </span>
      </div>

      <div className="rounded-lg border divide-y">
        {rows.map((row) => (
          <div
            key={row.athleteId}
            className="flex items-center gap-3 px-4 py-3 flex-wrap"
          >
            {/* Name */}
            <span className="font-medium text-sm flex-1 min-w-[120px]">
              {row.athleteName}
            </span>

            {/* RPE badges */}
            <div className="flex items-center gap-2 text-xs">
              {row.rpe_pre != null ? (
                <span className={`px-2 py-0.5 rounded-full font-medium ${rpeColor(row.rpe_pre)}`}>
                  Pre {row.rpe_pre}/10
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-muted-foreground bg-muted">
                  Pre —
                </span>
              )}
              {row.rpe_post != null ? (
                <span className={`px-2 py-0.5 rounded-full font-medium ${rpeColor(row.rpe_post)}`}>
                  Post {row.rpe_post}/10
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-muted-foreground bg-muted">
                  Post —
                </span>
              )}
            </div>

            {/* Status buttons */}
            <div className="flex items-center gap-1.5 relative">
              {savingId === row.athleteId && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground absolute -left-5" />
              )}
              {(["present", "late", "absent"] as AttendanceStatus[]).map((s) => (
                <StatusButton
                  key={s}
                  status={s}
                  active={row.status === s}
                  onClick={() => setStatus(row.athleteId, s)}
                  disabled={savingId === row.athleteId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
