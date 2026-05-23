"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Settings2, KeyRound, CalendarDays, Check } from "lucide-react";
import { sendPasswordReset, assignCalendarToAthlete } from "@/app/(coach)/coach/athletes/actions";

interface CalendarOption {
  id: string;
  name: string;
  color: string;
  assignedToThisAthlete: boolean;
}

interface AthleteSettingsProps {
  athleteId: string;
  allCalendars: CalendarOption[];
}

export function AthleteSettings({ athleteId, allCalendars }: AthleteSettingsProps) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [calendarStates, setCalendarStates] = useState<Record<string, boolean>>(
    Object.fromEntries(allCalendars.map((c) => [c.id, c.assignedToThisAthlete]))
  );

  async function handlePasswordReset() {
    if (!confirm("Send a password reset email to this athlete?")) return;
    setResetting(true);
    try {
      await sendPasswordReset(athleteId);
      setResetDone(true);
      setTimeout(() => setResetDone(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setResetting(false);
    }
  }

  async function toggleCalendar(calendarId: string, current: boolean) {
    setSaving(calendarId);
    try {
      await assignCalendarToAthlete(calendarId, current ? null : athleteId);
      setCalendarStates((prev) => ({ ...prev, [calendarId]: !current }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update calendar");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="h-4 w-4 mr-1.5" />
        Edit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Athlete settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-1">
            {/* Calendar access */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Individual calendar access</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Toggle calendars to give this athlete direct access, independent of their team.
              </p>
              {allCalendars.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No calendars yet.</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {allCalendars.map((cal) => {
                    const isAssigned = calendarStates[cal.id] ?? false;
                    const isSaving = saving === cal.id;
                    return (
                      <button
                        key={cal.id}
                        onClick={() => !isSaving && toggleCalendar(cal.id, isAssigned)}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                        disabled={isSaving}
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                          <span className="text-sm">{cal.name}</span>
                        </div>
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isAssigned ? "bg-primary border-primary" : "border-muted-foreground/30"
                        }`}>
                          {isAssigned && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Password reset */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Password reset</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handlePasswordReset}
                disabled={resetting || resetDone}
              >
                {resetDone ? "Reset email sent ✓" : resetting ? "Sending…" : "Send password reset email"}
              </Button>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
