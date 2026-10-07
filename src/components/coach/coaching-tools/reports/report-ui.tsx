"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

// Shared building blocks for the coach reports: headline stat tiles, a titled
// chart frame, a sortable table, and the empty state.

// Single-series marks use the brand violet; the second series (RPE post) uses
// an orange validated against it for color-vision deficiency in both themes.
export const SERIES_1 = "var(--primary)";
export const SERIES_2 = "#eb6834";

export const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
export const GRID_STROKE = "var(--border)";

export function shortDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function longDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function compactNumber(n: number): string {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
}

// ── Stat tiles ────────────────────────────────────────────────────────────────

export type Stat = { label: string; value: ReactNode; hint?: ReactNode };

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
          <p className="text-2xl font-bold tabular-nums mt-1 leading-none">{s.value}</p>
          {s.hint && <p className="text-xs text-muted-foreground mt-1.5 truncate">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Chart frame ───────────────────────────────────────────────────────────────

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function ChartTooltip({ title, lines }: { title: ReactNode; lines: ReactNode[] }) {
  return (
    <div className="rounded-lg border bg-popover text-popover-foreground px-3 py-2 text-xs shadow-md">
      <p className="font-semibold mb-0.5">{title}</p>
      {lines.map((l, i) => <p key={i} className="tabular-nums">{l}</p>)}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

// ── Sortable table ────────────────────────────────────────────────────────────

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  // Value to sort by; columns without one aren't sortable.
  sort?: (row: T) => string | number;
  align?: "left" | "right";
  className?: string;
};

export function SortableTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  pageSize = 50,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
}) {
  const [sort, setSort] = useState(initialSort);
  const [limit, setLimit] = useState(pageSize);

  const col = columns.find((c) => c.key === sort?.key);
  const sorted = col?.sort
    ? [...rows].sort((a, b) => {
        const va = col.sort!(a), vb = col.sort!(b);
        const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
        return sort!.dir === "asc" ? cmp : -cmp;
      })
    : rows;

  function toggle(c: Column<T>) {
    if (!c.sort) return;
    setSort((s) => s?.key === c.key
      ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" }
      : { key: c.key, dir: c.align === "right" ? "desc" : "asc" });
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = !active ? ChevronsUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    className={`px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {c.sort ? (
                      <button
                        onClick={() => toggle(c)}
                        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
                      >
                        {c.header}
                        <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} />
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.slice(0, limit).map((row) => (
              <tr key={rowKey(row)} className="hover:bg-muted/30">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button
          onClick={() => setLimit((l) => l + pageSize)}
          className="w-full border-t py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30"
        >
          Show more ({sorted.length - limit} remaining)
        </button>
      )}
    </div>
  );
}
