"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Gauge, Heart, Users } from "lucide-react";

const TABS = [
  { href: "/coach/coaching-tools",           label: "Live Monitor", icon: Activity },
  { href: "/coach/coaching-tools/rpe",       label: "RPE",          icon: Gauge },
  { href: "/coach/coaching-tools/reports",   label: "Reports",      icon: BarChart3 },
  { href: "/coach/coaching-tools/wellness",  label: "Wellness",     icon: Heart },
  { href: "/coach/coaching-tools/coaches",   label: "Coaches",      icon: Users },
];

export function CoachingToolsNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b">
      {TABS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
