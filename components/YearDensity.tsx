"use client";

import { useEffect, useMemo, useState } from "react";
import type { Booking } from "@/lib/types";
import { buildDensity, BUCKET_LABELS } from "@/lib/density";

// Colour ramp by how many days that week is spoken for. Four steps keeps the
// scale readable — more shades would be noise, not information.
function tone(days: number): string {
  if (days === 0) return "bg-paper text-ink-faint";
  if (days <= 2) return "bg-accent/12 text-ink";
  if (days <= 4) return "bg-accent/30 text-ink";
  return "bg-accent text-white";
}

const KEY = "lineup.density.open";

const rangeLabel = (from: number, to: number) => {
  const f = new Date(from);
  const t = new Date(to - 86_400_000);
  const mon = f.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${mon} ${f.getUTCDate()}–${t.getUTCDate()}`;
};

// Days in the month — denominator for "7 of 30".
const daysInMonth = (m: { year: number; weeks: { to: number }[] }) =>
  new Date(m.weeks[m.weeks.length - 1].to - 86_400_000).getUTCDate();

export function YearDensity({
  bookings,
  selectedWeek,
  onSelectWeek,
}: {
  bookings: Booking[];
  selectedWeek: number | null;
  onSelectWeek: (weekStart: number | null) => void;
}) {
  const months = useMemo(() => buildDensity(bookings, 6), [bookings]);
  // Collapsed by default — it's a reference view, not the main event.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(window.localStorage.getItem(KEY) === "1");
  }, []);
  const toggle = () => {
    setOpen((v) => {
      window.localStorage.setItem(KEY, v ? "0" : "1");
      return !v;
    });
  };

  const busiest = Math.max(...months.map((m) => m.days), 0);
  if (busiest === 0) return null;

  // One-line gist for the collapsed state, so it earns its row of pixels.
  const busy = months.filter((m) => m.days >= 3).map((m) => m.label);
  const free = months.filter((m) => m.days === 0).map((m) => m.label);
  const summary = [
    busy.length ? `${busy.join(" & ")} busiest` : null,
    free.length ? `${free.join(", ")} open` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-2xl border border-line bg-raised">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left md:px-5"
      >
        <i
          className="ti ti-chart-bar text-[18px] text-ink-faint"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">
            How packed the next 6 months are
          </span>
          {!open && summary && (
            <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
              {summary}
            </span>
          )}
        </span>
        <i
          className={`ti ti-chevron-down shrink-0 text-[18px] text-ink-faint transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3.5 md:px-5">
          <p className="text-[12px] text-ink-faint">
            Each square is a stretch of days in that month · the number is how
            many of those days have something booked · tap one to see it
          </p>

          <div className="mt-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 pl-9 pr-0 md:pr-20">
              {BUCKET_LABELS.map((l) => (
                <span
                  key={l}
                  className="flex-1 text-center font-mono text-[11px] font-medium text-ink-soft"
                >
                  {l}
                </span>
              ))}
              <span className="hidden w-20 shrink-0 text-right text-[11px] font-medium text-ink-soft md:block">
                Days booked
              </span>
            </div>

            {months.map((m) => (
              <div key={m.key} className="flex items-center gap-1.5">
                <span className="w-9 shrink-0 text-[12px] font-medium text-ink-soft">
                  {m.label}
                </span>
                {m.weeks.map((w) => {
                  const active = selectedWeek === w.from;
                  return (
                    <button
                      key={w.key}
                      onClick={() => onSelectWeek(active ? null : w.from)}
                      title={`${rangeLabel(w.from, w.to)} — ${w.days} day${
                        w.days === 1 ? "" : "s"
                      } booked`}
                      className={`grid h-7 flex-1 place-items-center rounded-md font-mono text-[11.5px] font-medium transition-all ${tone(
                        w.days,
                      )} ${
                        active
                          ? "ring-2 ring-ink ring-offset-1 ring-offset-raised"
                          : "hover:opacity-80"
                      }`}
                    >
                      {w.days || "0"}
                    </button>
                  );
                })}
                <span className="hidden w-20 shrink-0 text-right text-[11px] text-ink-faint md:block">
                  {m.days === 0
                    ? "nothing on"
                    : `${m.days} of ${daysInMonth(m)}`}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-ink-soft">Free</span>
              <span className="size-3.5 rounded-[3px] bg-paper ring-1 ring-inset ring-line" />
              <span className="size-3.5 rounded-[3px] bg-accent/15" />
              <span className="size-3.5 rounded-[3px] bg-accent/45" />
              <span className="size-3.5 rounded-[3px] bg-accent" />
              <span className="text-[12px] text-ink-soft">Packed</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
