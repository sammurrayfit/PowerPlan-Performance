"use client";

import { useState } from "react";
import { Brain, Utensils } from "lucide-react";

type Tab = "checkin" | "nutrition";

interface Athlete { id: string; full_name: string; }

interface Checkin {
  id: string;
  athlete_id: string;
  date: string;
  energy_level: number | null;
  stress_level: number | null;
  motivation: number | null;
  sleep_hours: number | null;
  notes: string | null;
}

interface Nutrition {
  id: string;
  athlete_id: string;
  date: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  notes: string | null;
}

function ScoreDot({ value, type }: { value: number | null; type: "energy" | "stress" | "motivation" }) {
  if (value == null) return <span className="text-muted-foreground/40">—</span>;
  const colors = {
    energy:     value >= 7 ? "bg-green-500" : value >= 4 ? "bg-amber-400" : "bg-red-400",
    stress:     value >= 7 ? "bg-red-400"   : value >= 4 ? "bg-amber-400" : "bg-green-500",
    motivation: value >= 7 ? "bg-green-500" : value >= 4 ? "bg-amber-400" : "bg-red-400",
  };
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-2 h-2 rounded-full ${colors[type]}`} />
      {value}
    </span>
  );
}

function fmtDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CoachWellnessView({ athletes, checkins, nutrition }: {
  athletes: Athlete[];
  checkins: Checkin[];
  nutrition: Nutrition[];
}) {
  const [tab, setTab] = useState<Tab>("checkin");
  const nameMap = Object.fromEntries(athletes.map((a) => [a.id, a.full_name]));

  return (
    <div className="space-y-5">
      <div className="flex rounded-lg border overflow-hidden text-sm w-fit">
        <button
          onClick={() => setTab("checkin")}
          className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${tab === "checkin" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
        >
          <Brain className="h-4 w-4" /> Check-ins
        </button>
        <button
          onClick={() => setTab("nutrition")}
          className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${tab === "nutrition" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
        >
          <Utensils className="h-4 w-4" /> Nutrition
        </button>
      </div>

      {tab === "checkin" && (
        checkins.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No check-ins submitted in the last 7 days.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Athlete</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-center">Energy</th>
                  <th className="px-4 py-2 text-center">Stress</th>
                  <th className="px-4 py-2 text-center">Motivation</th>
                  <th className="px-4 py-2 text-center">Sleep</th>
                  <th className="px-4 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {checkins.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{nameMap[c.athlete_id] ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(c.date)}</td>
                    <td className="px-4 py-2.5 text-center"><ScoreDot value={c.energy_level} type="energy" /></td>
                    <td className="px-4 py-2.5 text-center"><ScoreDot value={c.stress_level} type="stress" /></td>
                    <td className="px-4 py-2.5 text-center"><ScoreDot value={c.motivation} type="motivation" /></td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">
                      {c.sleep_hours != null ? `${c.sleep_hours}h` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate">
                      {c.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "nutrition" && (
        nutrition.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No nutrition logs submitted in the last 7 days.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Athlete</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-center">Calories</th>
                  <th className="px-4 py-2 text-center">Protein</th>
                  <th className="px-4 py-2 text-center">Carbs</th>
                  <th className="px-4 py-2 text-center">Fat</th>
                  <th className="px-4 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {nutrition.map((n) => (
                  <tr key={n.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{nameMap[n.athlete_id] ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(n.date)}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{n.calories ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{n.protein != null ? `${n.protein}g` : "—"}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{n.carbs != null ? `${n.carbs}g` : "—"}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{n.fat != null ? `${n.fat}g` : "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate">
                      {n.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
