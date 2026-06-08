"use client";

import { useState } from "react";
import { toast } from "sonner";
import { saveCheckin, saveNutrition } from "@/app/(athlete)/athlete/wellness/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Utensils } from "lucide-react";

type Tab = "checkin" | "nutrition";

interface Checkin {
  id: string;
  date: string;
  energy_level: number | null;
  stress_level: number | null;
  motivation: number | null;
  sleep_hours: number | null;
  notes: string | null;
}

interface Nutrition {
  id: string;
  date: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  notes: string | null;
}

function ScalePicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-sm font-semibold tabular-nums">{value}/10</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 h-8 rounded text-xs font-medium transition-colors ${
              n <= value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckinForm({ today, initial }: { today: string; initial: Checkin | null }) {
  const [energy, setEnergy] = useState(initial?.energy_level ?? 5);
  const [stress, setStress] = useState(initial?.stress_level ?? 5);
  const [motivation, setMotivation] = useState(initial?.motivation ?? 5);
  const [sleep, setSleep] = useState(String(initial?.sleep_hours ?? ""));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await saveCheckin({
        date: today,
        energy_level: energy,
        stress_level: stress,
        motivation,
        sleep_hours: sleep ? Number(sleep) : null,
        notes: notes || null,
      });
      toast.success("Check-in saved");
    } catch {
      toast.error("Failed to save check-in");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <ScalePicker label="Energy" value={energy} onChange={setEnergy} />
      <ScalePicker label="Stress" value={stress} onChange={setStress} />
      <ScalePicker label="Motivation" value={motivation} onChange={setMotivation} />

      <div className="space-y-1.5">
        <Label>Sleep (hours)</Label>
        <Input
          type="number"
          min="0"
          max="24"
          step="0.5"
          placeholder="e.g. 7.5"
          value={sleep}
          onChange={(e) => setSleep(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea
          placeholder="How are you feeling today?"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : initial ? "Update check-in" : "Save check-in"}
      </Button>
    </div>
  );
}

function NutritionForm({ today, initial }: { today: string; initial: Nutrition | null }) {
  const [calories, setCalories] = useState(String(initial?.calories ?? ""));
  const [protein, setProtein] = useState(String(initial?.protein ?? ""));
  const [carbs, setCarbs] = useState(String(initial?.carbs ?? ""));
  const [fat, setFat] = useState(String(initial?.fat ?? ""));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await saveNutrition({
        date: today,
        calories: calories ? Number(calories) : null,
        protein: protein ? Number(protein) : null,
        carbs: carbs ? Number(carbs) : null,
        fat: fat ? Number(fat) : null,
        notes: notes || null,
      });
      toast.success("Nutrition saved");
    } catch {
      toast.error("Failed to save nutrition");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Calories", value: calories, set: setCalories, placeholder: "e.g. 2400" },
          { label: "Protein (g)", value: protein, set: setProtein, placeholder: "e.g. 180" },
          { label: "Carbs (g)", value: carbs, set: setCarbs, placeholder: "e.g. 250" },
          { label: "Fat (g)", value: fat, set: setFat, placeholder: "e.g. 80" },
        ].map(({ label, value, set, placeholder }) => (
          <div key={label} className="space-y-1.5">
            <Label>{label}</Label>
            <Input
              type="number"
              min="0"
              placeholder={placeholder}
              value={value}
              onChange={(e) => set(e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea
          placeholder="Meals, supplements…"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : initial ? "Update nutrition" : "Log nutrition"}
      </Button>
    </div>
  );
}

function fmtDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function WellnessShell({ today, todayCheckin, todayNutrition, recentCheckins, recentNutrition }: {
  today: string;
  todayCheckin: Checkin | null;
  todayNutrition: Nutrition | null;
  recentCheckins: Checkin[];
  recentNutrition: Nutrition[];
}) {
  const [tab, setTab] = useState<Tab>("checkin");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Wellness</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(today + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-lg border overflow-hidden text-sm">
        <button
          onClick={() => setTab("checkin")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${tab === "checkin" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
        >
          <Brain className="h-4 w-4" /> Check-in
        </button>
        <button
          onClick={() => setTab("nutrition")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${tab === "nutrition" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
        >
          <Utensils className="h-4 w-4" /> Nutrition
        </button>
      </div>

      {/* Today's form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Today</CardTitle>
        </CardHeader>
        <CardContent>
          {tab === "checkin"
            ? <CheckinForm today={today} initial={todayCheckin} />
            : <NutritionForm today={today} initial={todayNutrition} />}
        </CardContent>
      </Card>

      {/* Recent history */}
      {tab === "checkin" && recentCheckins.filter(c => c.date !== today).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent</p>
          <div className="rounded-lg border divide-y">
            {recentCheckins.filter(c => c.date !== today).slice(0, 7).map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <span className="text-muted-foreground w-20 shrink-0">{fmtDate(c.date)}</span>
                <div className="flex gap-3 flex-wrap text-xs">
                  {c.energy_level != null && <span>⚡ {c.energy_level}</span>}
                  {c.stress_level != null && <span>😤 {c.stress_level}</span>}
                  {c.motivation != null && <span>🔥 {c.motivation}</span>}
                  {c.sleep_hours != null && <span>💤 {c.sleep_hours}h</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "nutrition" && recentNutrition.filter(n => n.date !== today).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent</p>
          <div className="rounded-lg border divide-y">
            {recentNutrition.filter(n => n.date !== today).slice(0, 7).map((n) => (
              <div key={n.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <span className="text-muted-foreground w-20 shrink-0">{fmtDate(n.date)}</span>
                <div className="flex gap-3 flex-wrap text-xs">
                  {n.calories != null && <span>{n.calories} kcal</span>}
                  {n.protein != null && <span>P: {n.protein}g</span>}
                  {n.carbs != null && <span>C: {n.carbs}g</span>}
                  {n.fat != null && <span>F: {n.fat}g</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
