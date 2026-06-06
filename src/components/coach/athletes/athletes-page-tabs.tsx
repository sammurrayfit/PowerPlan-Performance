"use client";

import { useState, type ReactNode } from "react";

interface AthletesPageTabsProps {
  roster: ReactNode;
  leaderboard: ReactNode;
  importHint?: ReactNode;
}

export function AthletesPageTabs({ roster, leaderboard, importHint }: AthletesPageTabsProps) {
  const [tab, setTab] = useState<"roster" | "leaderboard">("roster");

  return (
    <>
      <div className="flex border-b">
        {(["roster", "leaderboard"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div>
        {tab === "roster" ? roster : (
          <div className="space-y-4">
            {importHint}
            {leaderboard}
          </div>
        )}
      </div>
    </>
  );
}
