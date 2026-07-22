"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserPlus, UserMinus } from "lucide-react";
import { inviteCoach, createCoachDirectly, removeCoach } from "@/app/(coach)/coach/coaching-tools/coaches/actions";

interface Coach {
  id: string;
  full_name: string;
  created_at: string;
}

function AddCoachDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<"invite" | "direct">("direct");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      if (method === "direct") {
        await createCoachDirectly(fd);
      } else {
        await inviteCoach(fd);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add coach");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4 mr-1.5" />
        Add coach
      </Button>

      <Dialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add coach</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-3 mt-2">
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
                  <p className="text-xs text-muted-foreground">Share this with the coach — they can change it after logging in.</p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                They&apos;ll get full access to your roster, teams, calendars, and programs — same as you.
              </p>
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

export function CoachList({ coaches }: { coaches: Coach[] }) {
  const router = useRouter();

  async function handleRemove(coachId: string, name: string) {
    if (!confirm(`Remove ${name} as a co-coach? They'll keep their login but lose access to your roster and programs.`)) return;
    try {
      await removeCoach(coachId);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove coach");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {coaches.length} co-coach{coaches.length !== 1 ? "es" : ""} with full access to your roster
        </p>
        <AddCoachDialog />
      </div>

      {coaches.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
          <p className="font-medium">No co-coaches yet</p>
          <p className="text-sm mt-1">Add one above to share full access to your roster, teams, and programs.</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {coaches.map((coach) => (
            <div key={coach.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                  {coach.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{coach.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(coach.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRemove(coach.id, coach.full_name)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Remove co-coach"
              >
                <UserMinus className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
