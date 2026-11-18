import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** The team's time zone. Dates in the app are calendar days in this zone. */
export const TEAM_TIME_ZONE = "America/New_York";

/** Today's date as YYYY-MM-DD in the team's time zone. Use this instead of
 *  `new Date().toISOString().split("T")[0]`, which is the UTC date and rolls
 *  over to tomorrow at 7–8 PM Eastern. */
export function todayNY(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TEAM_TIME_ZONE }).format(new Date());
}

// Pre-Activation always renders before other workouts on the same date.
export function compareWorkoutOrder<T extends { date: string; title: string }>(a: T, b: T): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const aPre = a.title === "Pre-Activation";
  const bPre = b.title === "Pre-Activation";
  if (aPre !== bPre) return aPre ? -1 : 1;
  return 0;
}
