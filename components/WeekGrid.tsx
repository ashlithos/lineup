"use client";

import { useState } from "react";
import type { Booking } from "@/lib/types";
import {
  buildWeek,
  DAY_START,
  DAY_END,
  dur,
  hhmm,
  type Block,
} from "@/lib/freetime";

const SPAN = DAY_END - DAY_START;
const pct = (m: number) => ((m - DAY_START) / SPAN) * 100;

const TONE: Record<Block["kind"], string> = {
  travel: "bg-accent text-white",
  event: "bg-soon text-white",
  meal: "bg-line text-ink-soft",
  unknown:
    "bg-soon-soft text-soon border border-dashed border-soon/60",
};

const weekday = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
const dayNum = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

// Hour lines every 2 hours keeps the grid readable without a ruler effect.
const HOURS = Array.from(
  { length: Math.floor(SPAN / 120) + 1 },
  (_, i) => DAY_START + i * 120,
);

export function WeekGrid({
  bookings,
  onOpen,
}: {
  bookings: Booking[];
  onOpen: (b: Booking) => void;
}) {
  const [meals, setMeals] = useState(true);
  const days = buildWeek(bookings, { meals });
  if (!days.length) return null;

  const anyUnknown = days.some((d) => d.hasUnknown);

  return (
    <section className="rounded-xl border border-line bg-raised p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[13px] text-ink-soft">
          Open time each day, 7am–11pm
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-soft">
          <input
            type="checkbox"
            checked={meals}
            onChange={(e) => setMeals(e.target.checked)}
            className="size-3.5 accent-[var(--color-accent)]"
          />
          Show typical meal times
        </label>
      </div>

      {/* The grid scrolls sideways on narrow screens rather than squashing. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div
          className="grid min-w-[560px] gap-1.5"
          style={{ gridTemplateColumns: `34px repeat(${days.length}, minmax(64px, 1fr))` }}
        >
          {/* header row */}
          <div />
          {days.map((d) => (
            <div key={`h-${d.key}`} className="pb-1 text-center">
              <div className="text-[12px] font-semibold text-ink">
                {weekday(d.date)}
              </div>
              <div className="text-[10.5px] text-ink-faint">{dayNum(d.date)}</div>
            </div>
          ))}

          {/* hour gutter */}
          <div className="relative h-[320px]">
            {HOURS.map((h) => (
              <span
                key={h}
                className="absolute right-1 -translate-y-1/2 font-mono text-[9.5px] text-ink-faint"
                style={{ top: `${pct(h)}%` }}
              >
                {hhmm(h)}
              </span>
            ))}
          </div>

          {/* day columns */}
          {days.map((d) => (
            <div
              key={d.key}
              className="relative h-[320px] overflow-hidden rounded-lg bg-ok-soft/60"
            >
              {HOURS.map((h) => (
                <span
                  key={h}
                  className="absolute inset-x-0 border-t border-line/70"
                  style={{ top: `${pct(h)}%` }}
                  aria-hidden="true"
                />
              ))}

              {d.blocks.map((b) => {
                const top = pct(b.start);
                const height = Math.max(pct(b.end) - top, 4);
                const tall = height > 11;
                const inner = (
                  <>
                    <span className="block truncate font-medium leading-tight">
                      {b.label}
                    </span>
                    {tall && (
                      <span className="block truncate opacity-85">
                        {hhmm(b.start)}
                        {b.kind !== "unknown" && `–${hhmm(b.end)}`}
                        {b.kind === "unknown" && " · end unknown"}
                      </span>
                    )}
                  </>
                );
                const cls = `absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[9.5px] ${TONE[b.kind]}`;
                const style = { top: `${top}%`, height: `${height}%` };
                return b.booking ? (
                  <button
                    key={b.key}
                    onClick={() => onOpen(b.booking!)}
                    title={`${b.label} · ${hhmm(b.start)}–${hhmm(b.end)}`}
                    className={`${cls} transition-opacity hover:opacity-85`}
                    style={style}
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={b.key} className={cls} style={style} aria-hidden="true">
                    {inner}
                  </div>
                );
              })}

              {/* Label the open stretches — the point of the whole view. */}
              {d.free.map((f) => {
                const h = pct(f.end) - pct(f.start);
                if (h < 9) return null;
                return (
                  <span
                    key={f.key}
                    className="pointer-events-none absolute inset-x-0 flex items-center justify-center text-[9.5px] font-semibold text-ok"
                    style={{ top: `${pct(f.start)}%`, height: `${h}%` }}
                  >
                    {dur(f.end - f.start)} free
                  </span>
                );
              })}
            </div>
          ))}

          {/* totals row */}
          <div className="pt-1.5 text-right font-mono text-[9.5px] text-ink-faint">
            free
          </div>
          {days.map((d) => (
            <div
              key={`t-${d.key}`}
              className="pt-1.5 text-center font-mono text-[11px] font-medium text-ink"
            >
              {dur(d.freeMinutes)}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-2.5">
        {[
          ["bg-ok-soft", "free"],
          ["bg-accent", "travel"],
          ["bg-soon", "booked event"],
          ["bg-line", "meal window"],
        ].map(([c, label]) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className={`size-3 rounded-[3px] ${c}`} aria-hidden="true" />
            {label}
          </span>
        ))}
        {anyUnknown && (
          <span className="flex items-center gap-1.5 text-[11px] text-soon">
            <span
              className="size-3 rounded-[3px] border border-dashed border-soon/60 bg-soon-soft"
              aria-hidden="true"
            />
            landing time missing — add it for an accurate day
          </span>
        )}
      </div>
    </section>
  );
}
