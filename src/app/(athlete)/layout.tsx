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
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold">PowerPlan Performance</span>
        <span className="text-sm text-muted-foreground">{profile.full_name}</span>
      </header>
      <main className="p-4 max-w-2xl mx-auto">{children}</main>
      <Toaster richColors />
    </div>
  );
}
