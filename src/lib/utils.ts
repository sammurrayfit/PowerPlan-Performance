import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Pre-Activation always renders before other workouts on the same date.
export function compareWorkoutOrder<T extends { date: string; title: string }>(a: T, b: T): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const aPre = a.title === "Pre-Activation";
  const bPre = b.title === "Pre-Activation";
  if (aPre !== bPre) return aPre ? -1 : 1;
  return 0;
}
