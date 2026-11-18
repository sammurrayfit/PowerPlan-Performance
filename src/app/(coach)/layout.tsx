import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CoachSidebar } from "@/components/coach/coach-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { EMBED_MARKER } from "@/lib/supabase/embed";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "coach") redirect("/athlete/dashboard");

  // Read sidebar cookie server-side to avoid hydration mismatch
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  // Inside the ABCM AMS the AMS shows its own side tab bar, so hide PowerPlan's.
  const embedded = cookieStore.get(EMBED_MARKER)?.value === "1";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      {!embedded && <CoachSidebar profile={profile} />}
      <SidebarInset>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
      <Toaster richColors />
    </SidebarProvider>
  );
}
