import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/ui/sonner";

export default async function AthleteLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "athlete") redirect("/coach/dashboard");


  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="border-b px-4 py-3 flex items-center justify-between sticky top-0 bg-background z-10">
        <span className="font-bold text-sm">PowerPlan</span>
        <span className="text-xs text-muted-foreground">{profile.full_name}</span>
      </header>
      <main className="p-4 max-w-2xl mx-auto">{children}</main>
      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-background flex">
        {[
          { href: "/athlete/dashboard", label: "Today" },
          { href: "/athlete/calendar", label: "Calendar" },
          { href: "/athlete/history", label: "History" },
          { href: "/athlete/prs", label: "PRs" },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="flex-1 py-3 text-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {label}
          </Link>
        ))}
      </nav>
      <Toaster richColors />
    </div>
  );
}
