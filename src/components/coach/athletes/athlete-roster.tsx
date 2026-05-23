"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserPlus, UserMinus, ChevronRight } from "lucide-react";
import { inviteAthlete, removeAthleteFromTeam } from "@/app/(coach)/coach/athletes/actions";

interface Athlete {
  id: string;
  full_name: string;
  joined_at: string;
}

interface Team {
  id: string;
  name: string;
  athletes: Athlete[];
}

interface AthleteRosterProps {
  teams: Team[];
}

function InviteDialog({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await inviteAthlete(fd);
      setOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4 mr-1.5" />
        Invite athlete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite athlete to {teamName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <input type="hidden" name="team_id" value={teamId} />
            <div className="space-y-3 mt-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input name="full_name" placeholder="Jane Smith" required />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input name="email" type="email" placeholder="jane@example.com" required />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AthleteRoster({ teams }: AthleteRosterProps) {
  async function handleRemove(athleteId: string, teamId: string, name: string) {
    if (!confirm(`Remove ${name} from this team?`)) return;
    await removeAthleteFromTeam(athleteId, teamId);
  }

  if (teams.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="font-medium">No teams yet</p>
        <p className="text-sm mt-1">Create a team on the Calendar page first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {teams.map((team) => (
        <div key={team.id} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{team.name}</h2>
            <InviteDialog teamId={team.id} teamName={team.name} />
          </div>

          {team.athletes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No athletes yet — send an invite above.</p>
          ) : (
            <div className="rounded-lg border divide-y">
              {team.athletes.map((athlete) => (
                <div key={athlete.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <Link href={`/coach/athletes/${athlete.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                      {athlete.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{athlete.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {new Date(athlete.joined_at).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/coach/athletes/${athlete.id}`}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <button
                      onClick={() => handleRemove(athlete.id, team.id, athlete.full_name)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                      title="Remove from team"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
