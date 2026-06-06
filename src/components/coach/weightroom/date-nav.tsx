"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_HEADERS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

interface Props {
  date: string;
  today: string;
}

export function DateNav({ date, today }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Calendar nav state
  const parsed = new Date(date + "T00:00:00");
  const [calYear, setCalYear] = useState(parsed.getFullYear());
  const [calMonth, setCalMonth] = useState(parsed.getMonth());

  // Sync calendar month when date prop changes
  useEffect(() => {
    const d = new Date(date + "T00:00:00");
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
  }, [date]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function go(days: number) {
    router.push(`/coach/weightroom?date=${addDays(date, days)}`);
  }

  function pick(d: string) {
    setOpen(false);
    router.push(d === today ? "/coach/weightroom" : `/coach/weightroom?date=${d}`);
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  // Build grid
  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const label = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
  const isToday = date === today;

  return (
    <div className="flex items-center gap-1" ref={ref}>
      {/* Prev day */}
      <button
        onClick={() => go(-1)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Date button — opens calendar */}
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-muted transition-colors text-sm font-medium"
        >
          <span>{label}</span>
          {isToday && <span className="text-xs text-primary">(Today)</span>}
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 bg-popover border rounded-xl shadow-lg p-3 w-64">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-2">
              <button onClick={prevMonth} className="p-1 rounded hover:bg-muted transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold">{MONTH_NAMES[calMonth]} {calYear}</span>
              <button onClick={nextMonth} className="p-1 rounded hover:bg-muted transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_HEADERS.map(h => (
                <div key={h} className="text-center text-[10px] font-medium text-muted-foreground py-1">{h}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((day, i) => {
                const ds = day ? toDateStr(calYear, calMonth, day) : null;
                const isSelected = ds === date;
                const isTodayCell = ds === today;
                return (
                  <button
                    key={i}
                    disabled={!day}
                    onClick={() => ds && pick(ds)}
                    className={`
                      h-8 w-8 mx-auto rounded-full text-sm transition-colors
                      ${!day ? "invisible" : ""}
                      ${isSelected ? "bg-primary text-primary-foreground font-semibold" : ""}
                      ${!isSelected && isTodayCell ? "border border-primary text-primary font-medium" : ""}
                      ${!isSelected && !isTodayCell && day ? "hover:bg-muted" : ""}
                    `}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Jump to today */}
            {!isToday && (
              <button
                onClick={() => pick(today)}
                className="mt-2 w-full text-center text-xs text-primary hover:underline"
              >
                Jump to today
              </button>
            )}
          </div>
        )}
      </div>

      {/* Next day */}
      <button
        onClick={() => go(1)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
