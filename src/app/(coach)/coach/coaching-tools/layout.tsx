import { CoachingToolsNav } from "@/components/coach/coaching-tools/coaching-tools-nav";

export default function CoachingToolsLayout({ children }: { children: React.ReactNode }) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Coaching Tools</h1>
        <p className="text-sm text-muted-foreground">{today}</p>
      </div>
      <CoachingToolsNav />
      {children}
    </div>
  );
}
