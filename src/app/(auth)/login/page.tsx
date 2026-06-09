"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

type View = "login" | "forgot-password" | "forgot-email";

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
    } else {
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/invite/setup`,
    });
    if (error) {
      toast.error(error.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  }

  // ── Forgot email view ────────────────────────────────────────────────────────
  if (view === "forgot-email") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Toaster richColors />
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">Forgot your email?</CardTitle>
            <CardDescription>Your login email is the one your coach used to invite you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Check your inbox for an invite email from PowerPlan Performance — your login email is the address it was sent to.</p>
            <p>If you still can't find it, contact your coach and ask them to resend the invite or reset your password.</p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => setView("login")}>
              Back to sign in
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ── Forgot password view ─────────────────────────────────────────────────────
  if (view === "forgot-password") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Toaster richColors />
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">Reset password</CardTitle>
            <CardDescription>
              {resetSent
                ? "Check your email for a reset link."
                : "Enter your email and we'll send you a reset link."}
            </CardDescription>
          </CardHeader>
          {!resetSent && (
            <form onSubmit={handleResetPassword}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="coach@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to sign in
                </button>
              </CardFooter>
            </form>
          )}
          {resetSent && (
            <CardFooter>
              <Button variant="outline" className="w-full" onClick={() => { setView("login"); setResetSent(false); }}>
                Back to sign in
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    );
  }

  // ── Login view ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Toaster richColors />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">PowerPlan Performance</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="coach@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => setView("forgot-password")}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => setView("forgot-email")}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Forgot which email you used?
            </button>
            <p className="text-sm text-muted-foreground text-center">
              New coach?{" "}
              <Link href="/signup" className="underline underline-offset-4">
                Create an account
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
