"use client";

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { RPERow, RPEPoint } from "@/app/(coach)/coach/coaching-tools/reports/actions";
import { RPE_LABELS } from "@/lib/rpe";

interface Props {
  rows: RPERow[];
  prePoints: RPEPoint[];
  postPoints: RPEPoint[];
  viewMode: "chart" | "table";
}

const COLORS = [
  "#6366f1","#3b82f6","#22c55e","#f97316",
  "#ef4444","#a855f7","#ec4899","#14b8a6",
];

function rpeLabel(rpe: number): string {
  return RPE_LABELS[rpe] ?? String(rpe);
}

function rpeColor(_rpe: number | null): string {
  return "text-foreground";
}

export function RPEReport({ rows, prePoints, postPoints, viewMode }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No RPE data for this period. Athletes submit pre-workout RPE when they open a locked workout.
      </p>
    );
  }

  const athleteNames = [...new Set(rows.map((r) => r.athleteName))];

  if (viewMode === "chart") {
    const hasPreData = prePoints.some((p) =>
      Object.keys(p).filter((k) => k !== "date").length > 0
    );
    const hasPostData = postPoints.some((p) =>
      Object.keys(p).filter((k) => k !== "date").length > 0
    );

    return (
      <div className="space-y-6">
        {hasPreData && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              Pre-Workout RPE (readiness)
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={prePoints} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    new Date(v + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  }
                />
                <YAxis domain={[1, 10]} ticks={[1, 3, 5, 7, 10]} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v, name) => [`${v}/10 — ${rpeLabel(Number(v))}`, name]}
                  labelFormatter={(label) =>
                    new Date(String(label) + "T00:00:00").toLocaleDateString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
                    })
                  }
                />
                <Legend />
                {athleteNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {hasPostData && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              Post-Workout RPE (effort)
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={postPoints} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    new Date(v + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  }
                />
                <YAxis domain={[1, 10]} ticks={[1, 3, 5, 7, 10]} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v, name) => [`${v}/10 — ${rpeLabel(Number(v))}`, name]}
                  labelFormatter={(label) =>
                    new Date(String(label) + "T00:00:00").toLocaleDateString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
                    })
                  }
                />
                <Legend />
                {athleteNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-2.5 font-medium">Date</th>
            <th className="text-left px-4 py-2.5 font-medium">Athlete</th>
            <th className="text-left px-4 py-2.5 font-medium">Workout</th>
            <th className="text-right px-4 py-2.5 font-medium">Pre RPE</th>
            <th className="text-right px-4 py-2.5 font-medium">Post RPE</th>
            <th className="text-right px-4 py-2.5 font-medium">Δ</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => {
            const delta =
              row.rpe_pre != null && row.rpe_post != null
                ? row.rpe_post - row.rpe_pre
                : null;
            return (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                  {new Date(row.date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </td>
                <td className="px-4 py-2.5 font-medium">{row.athleteName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.workoutTitle}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${rpeColor(row.rpe_pre)}`}>
                  {row.rpe_pre != null ? `${row.rpe_pre}/10` : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${rpeColor(row.rpe_post)}`}>
                  {row.rpe_post != null ? `${row.rpe_post}/10` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-muted-foreground">
                  {delta == null ? "—" : delta > 0 ? `+${delta}` : delta === 0 ? "0" : delta}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
