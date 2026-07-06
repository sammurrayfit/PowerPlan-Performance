"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, CalendarDays, Trash2, Users, User, Settings2, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Calendar = Database["public"]["Tables"]["calendars"]["Row"];
type Team = { id: string; name: string };
type Athlete = { id: string; full_name: string };

const COLORS = [
  // Reds & Pinks
  "#ef4444", "#dc2626", "#ec4899", "#db2777",
  // Oranges & Yellows
  "#f97316", "#ea580c", "#eab308", "#ca8a04",
  // Greens
  "#4ade80", "#16a34a", "#84cc16", "#166534",
  // Blues & Cyans
  "#3b82f6", "#2563eb", "#0ea5e9", "#0284c7",
  // Purples & Indigos
  "#8b5cf6", "#7c3aed", "#6366f1", "#32127A",
  // Teals & Neutrals
  "#14b8a6", "#0d9488", "#64748b", "#1e293b",
];

interface CalendarListProps {
  calendars: Calendar[];
  teams: Team[];
  coachId: string;
  athletesByTeam: Record<string, Athlete[]>;
}

function EditCalendarDialog({
  calendar,
  teams,
  onSaved,
}: {
  calendar: Calendar;
  teams: Team[];
  onSaved: (calendarId: string, updates: { team_id?: string | null; color?: string }) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(calendar.team_id ?? "");
  const [selectedColor, setSelectedColor] = useState(calendar.color);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updates = { team_id: selectedTeam || null, color: selectedColor };
    const { error } = await supabase.from("calendars").update(updates).eq("id", calendar.id);
    if (error) { alert(error.message); setSaving(false); return; }
    onSaved(calendar.id, updates);
    setOpen(false);
    setSaving(false);
  }

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-muted transition-all"
        title="Edit calendar"
      >
        <Settings2 className="h-4 w-4 text-muted-foreground" />
      </button>
      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Edit — {calendar.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className="h-8 w-8 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: selectedColor === c ? "white" : "transparent",
                      outline: selectedColor === c ? `2px solid ${c}` : "none",
                    }}
                  />
                ))}
              </div>
            </div>
            {teams.length > 0 && (
              <div className="space-y-1.5">
                <Label>Team</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                >
                  <option value="">No team (general calendar)</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CalendarPickerDialog({
  calendar,
  athletes,
  open,
  onOpenChange,
}: {
  calendar: Calendar;
  athletes: Athlete[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  function go(path: string) {
    onOpenChange(false);
    const back = encodeURIComponent(`/coach/calendar?open=${calendar.id}`);
    router.push(`${path}?back=${back}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{calendar.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-1">
          {/* Team calendar option */}
          <button
            onClick={() => go(`/coach/calendar/${calendar.id}`)}
            className="w-full flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:border-foreground/30 hover:bg-muted/40 transition-colors"
          >
            <div
              className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: calendar.color }}
            >
              <Users className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Team calendar</p>
              <p className="text-xs text-muted-foreground">View all workouts</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </button>

          {/* Athlete list */}
          {athletes.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 pt-1">
                Individual athletes
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {athletes.map((athlete) => (
                  <button
                    key={athlete.id}
                    onClick={() => go(`/coach/athletes/${athlete.id}`)}
                    className="w-full flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-left hover:border-foreground/30 hover:bg-muted/40 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <span className="flex-1 text-sm truncate">{athlete.full_name}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CalendarList({ calendars: initialCalendars, teams, coachId, athletesByTeam }: CalendarListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [calendarList, setCalendarList] = useState<Calendar[]>(initialCalendars);
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [pickerCalendar, setPickerCalendar] = useState<Calendar | null>(null);

  // Auto-open picker when returning from an athlete page
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      const cal = initialCalendars.find((c) => c.id === openId);
      if (cal) setPickerCalendar(cal);
    }
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);

    const { data, error } = await supabase
      .from("calendars")
      .insert({
        name: name.trim(),
        color,
        coach_id: coachId,
        team_id: teamId || null,
      })
      .select()
      .single();

    if (error) {
      alert("Failed to create calendar: " + error.message);
      setCreating(false);
      return;
    }

    setCalendarList((prev) => [...prev, data]);
    setOpen(false);
    setName("");
    setTeamId("");
    setColor(COLORS[0]);
    setCreating(false);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this calendar and all its workouts?")) return;
    setDeleting(id);
    const { error } = await supabase.from("calendars").delete().eq("id", id);
    if (!error) setCalendarList((prev) => prev.filter((c) => c.id !== id));
    setDeleting(null);
  }

  function handleCalendarUpdated(calendarId: string, updates: { team_id?: string | null; color?: string }) {
    setCalendarList((prev) =>
      prev.map((c) => c.id === calendarId ? { ...c, ...updates } : c)
    );
  }

  function handleCalendarClick(cal: Calendar) {
    // Team calendars with athletes get the picker; everything else navigates directly
    if (cal.team_id && (athletesByTeam[cal.team_id]?.length ?? 0) > 0) {
      setPickerCalendar(cal);
    } else {
      router.push(`/coach/calendar/${cal.id}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendars</h1>
          <p className="text-muted-foreground text-sm">{calendarList.length} calendar{calendarList.length !== 1 ? "s" : ""}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4 mr-2" />
            New calendar
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New calendar</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Team A — Spring 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {teams.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="team_id">Team (optional)</Label>
                  <select
                    id="team_id"
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">No team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="h-8 w-8 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c,
                        borderColor: color === c ? "white" : "transparent",
                        outline: color === c ? `2px solid ${c}` : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? "Creating…" : "Create calendar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {calendarList.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No calendars yet</p>
          <p className="text-sm mt-1">Create a calendar to start scheduling workouts.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {calendarList.map((cal) => (
            <div
              key={cal.id}
              onClick={() => handleCalendarClick(cal)}
              className="group relative flex items-center gap-4 rounded-lg border bg-card p-4 cursor-pointer hover:border-foreground/20 transition-colors"
            >
              <div
                className="h-10 w-10 rounded-full flex-shrink-0"
                style={{ backgroundColor: cal.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{cal.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  {cal.team_id ? (
                    <>
                      <Users className="h-3 w-3" />
                      Team calendar
                      {(athletesByTeam[cal.team_id]?.length ?? 0) > 0 && (
                        <span className="ml-1">· {athletesByTeam[cal.team_id].length} athletes</span>
                      )}
                    </>
                  ) : cal.athlete_id ? (
                    <><User className="h-3 w-3" /> Individual</>
                  ) : (
                    "General"
                  )}
                </p>
              </div>
              <EditCalendarDialog
                calendar={cal}
                teams={teams}
                onSaved={handleCalendarUpdated}
              />
              <button
                onClick={(e) => handleDelete(e, cal.id)}
                disabled={deleting === cal.id}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Calendar picker dialog for team calendars */}
      {pickerCalendar && (
        <CalendarPickerDialog
          calendar={pickerCalendar}
          athletes={pickerCalendar.team_id ? (athletesByTeam[pickerCalendar.team_id] ?? []) : []}
          open={!!pickerCalendar}
          onOpenChange={(o) => { if (!o) setPickerCalendar(null); }}
        />
      )}
    </div>
  );
}
