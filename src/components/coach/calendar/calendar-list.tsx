"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, CalendarDays, Trash2, Users, User } from "lucide-react";
import { createCalendar, deleteCalendar } from "@/app/(coach)/coach/calendar/actions";
import type { Database } from "@/lib/supabase/types";

type Calendar = Database["public"]["Tables"]["calendars"]["Row"];
type Team = { id: string; name: string };

const COLORS = [
  "#6366f1", "#3b82f6", "#22c55e", "#f97316",
  "#ef4444", "#a855f7", "#ec4899", "#14b8a6",
];

interface CalendarListProps {
  calendars: Calendar[];
  teams: Team[];
  coachId: string;
}

export function CalendarList({ calendars, teams, coachId }: CalendarListProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleCreate(formData: FormData) {
    formData.set("color", color);
    await createCalendar(formData);
    setOpen(false);
    setColor(COLORS[0]);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this calendar and all its workouts?")) return;
    setDeleting(id);
    await deleteCalendar(id);
    setDeleting(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendars</h1>
          <p className="text-muted-foreground text-sm">{calendars.length} calendar{calendars.length !== 1 ? "s" : ""}</p>
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
            <form action={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" placeholder="e.g. Team A — Spring 2026" required />
              </div>

              {teams.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="team_id">Team (optional)</Label>
                  <select
                    id="team_id"
                    name="team_id"
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

              <Button type="submit" className="w-full">Create calendar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {calendars.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No calendars yet</p>
          <p className="text-sm mt-1">Create a calendar to start scheduling workouts.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {calendars.map((cal) => (
            <div
              key={cal.id}
              onClick={() => router.push(`/coach/calendar/${cal.id}`)}
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
                    <><Users className="h-3 w-3" /> Team calendar</>
                  ) : cal.athlete_id ? (
                    <><User className="h-3 w-3" /> Individual</>
                  ) : (
                    "General"
                  )}
                </p>
              </div>
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
    </div>
  );
}
