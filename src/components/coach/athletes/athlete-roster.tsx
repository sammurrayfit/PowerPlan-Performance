"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserPlus, UserMinus, ChevronRight, Plus } from "lucide-react";
import { inviteAthlete, createAthleteDirectly, removeAthleteFromTeam, createTeam } from "@/app/(coach)/coach/athletes/actions";

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

function AddAthleteDialog({ teams }: { teams: Team[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id ?? "__new__");
  const [newTeamName, setNewTeamName] = useState("");
  const [method, setMethod] = useState<"invite" | "direct">("direct");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget);

      let teamId = selectedTeamId;
      if (selectedTeamId === "__new__") {
        const trimmed = newTeamName.trim();
        if (!trimmed) { alert("Enter a team name."); setLoading(false); return; }
        const created = await createTeam(trimmed);
        teamId = created.id;
      }

      fd.set("team_id", teamId);
      if (method === "direct") {
        await createAthleteDirectly(fd);
      } else {
        await inviteAthlete(fd);
      }
      setOpen(false);
      setNewTeamName("");
      setSelectedTeamId(teams[0]?.id ?? "__new__");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add athlete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4 mr-1.5" />
        Add athlete
      </Button>

      <Dialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add athlete</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-3 mt-2">
              {/* Method toggle */}
              <div className="flex rounded-lg border overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => setMethod("direct")}
                  className={`flex-1 py-1.5 transition-colors ${method === "direct" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  Set password
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("invite")}
                  className={`flex-1 py-1.5 transition-colors ${method === "invite" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  Email invite
                </button>
              </div>

              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input name="full_name" placeholder="Jane Smith" required />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input name="email" type="email" placeholder="jane@example.com" required />
              </div>

              {method === "direct" && (
                <div className="space-y-1.5">
                  <Label>Temporary password</Label>
                  <Input name="password" type="password" placeholder="8+ characters" minLength={8} required />
                  <p className="text-xs text-muted-foreground">Share this with the athlete — they can change it after logging in.</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Team</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                  <option value="__new__">+ Create new team…</option>
                </select>
              </div>
              {selectedTeamId === "__new__" && (
                <div className="space-y-1.5">
                  <Label>New team name</Label>
                  <Input
                    placeholder="e.g. Varsity, Group A"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                  />
                </div>
              )}
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Adding…" : method === "direct" ? "Create account" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateTeamDialog({ onCreated }: { onCreated: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createTeam(name.trim());
      setOpen(false);
      setName("");
      onCreated();
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        Create team
      </Button>
      <Dialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Create team</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-3 mt-2">
              <div className="space-y-1.5">
                <Label>Team name</Label>
                <Input
                  placeholder="e.g. Varsity, Group A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
              <Button type="submit" disabled={loading || !name.trim()}>
                {loading ? "Creating…" : "Create"}
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

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {teams.reduce((n, t) => n + t.athletes.length, 0)} athlete{teams.reduce((n, t) => n + t.athletes.length, 0) !== 1 ? "s" : ""} across {teams.length} team{teams.length !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-2">
          <CreateTeamDialog onCreated={() => {}} />
          <AddAthleteDialog teams={teams} />
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
          <p className="font-medium">No teams yet</p>
          <p className="text-sm mt-1">Create a team above, then add athletes to it.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {teams.map((team) => (
            <div key={team.id} className="space-y-3">
              <h2 className="text-lg font-semibold">{team.name}</h2>

              {team.athletes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No athletes yet — use Add Athlete above.</p>
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
      )}
    </div>
  );
}
