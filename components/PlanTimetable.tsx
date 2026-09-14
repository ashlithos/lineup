"use client";

import type { Booking } from "@/lib/types";
import { buildWeek, DAY_START, DAY_END, dur, hhmm } from "@/lib/freetime";
import { localDate } from "@/lib/localtime";

// The trip you're adding to, beside the form that adds to it. Picking a day
// from a list of dates asks you to hold the whole trip in your head; this puts
// it back in front of you, and a click on an open stretch answers both
// questions — which day, and what time — at once.

const SPAN = DAY_END - DAY_START;
const pct = (m: number) => ((m - DAY_START) / SPAN) * 100;

const TONE: Record<string, string> = {
  travel: "bg-line-strong text-ink",
  event: "bg-accent text-white",
  meal: "bg-ok-soft text-ok",
  hold: "border border-dashed border-accent bg-accent-soft/50 text-accent",
  unknown: "bg-soon-soft text-soon",
  transit: "bg-line text-ink",
  buffer: "bg-line/70 text-ink",
};

const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Round up to the next half hour — nobody plans a thing for 11:04. */
const tidy = (m: number) => Math.ceil(m / 30) * 30;

export function PlanTimetable({
  bookings,
  day,
  time,
  durationMin,
  onPick,
}: {
  bookings: Booking[];
  /** "YYYY-MM-DD", or "" when no day is chosen yet. */
  day: string;
  time: string;
  durationMin: number;
  onPick: (day: string, time?: string) => void;
}) {
  const days = buildWeek(bookings, { meals: true });
  if (!days.length) return null;

  const [h, m] = time.split(":").map(Number);
  const startMin = (h || 0) * 60 + (m || 0);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-soft">
          The trip so far
        </span>
        <span className="text-[11.5px] text-ink-faint">
          Tap an open stretch to place it
        </span>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div
          className="grid min-w-[420px] gap-1"
          style={{ gridTemplateColumns: `28px repeat(${days.length}, minmax(58px, 1fr))` }}
        >
          <span />
          {days.map((d) => {
            const iso = d.date.slice(0, 10);
            const on = iso === day;
            return (
              <button
                key={`h-${d.key}`}
                type="button"
                onClick={() => onPick(iso)}
                className={`rounded-md px-1 py-1 text-center transition-colors ${
                  on ? "bg-accent-soft" : "hover:bg-paper"
                }`}
              >
                <span
                  className={`block text-[11.5px] font-semibold ${
                    on ? "text-accent-strong" : "text-ink"
                  }`}
                >
                  {localDate(d.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    timeZone: "UTC",
                  })}
                </span>
                <span
                  className={`block text-[10px] ${
                    on ? "text-accent" : "text-ink-faint"
                  }`}
                >
                  {localDate(d.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </span>
              </button>
            );
          })}

          <div className="relative h-[260px]">
            {[9, 13, 17, 21].map((hr) => (
              <span
                key={hr}
                className="absolute right-1 -translate-y-1/2 font-mono text-[9px] text-ink-faint"
                style={{ top: `${pct(hr * 60)}%` }}
              >
                {hhmm(hr * 60)}
              </span>
            ))}
          </div>

          {days.map((d) => {
            const iso = d.date.slice(0, 10);
            const on = iso === day;
            return (
              <div
                key={d.key}
                className={`relative h-[260px] overflow-hidden rounded-lg border bg-raised ${
                  on ? "border-accent" : "border-line"
                }`}
              >
                {d.blocks.map((b) => {
                  const top = pct(b.start);
                  const height = Math.max(pct(b.end) - top, 3);
                  return (
                    <span
                      key={b.key}
                      title={`${b.label} · ${hhmm(b.start)}–${hhmm(b.end)}`}
                      className={`absolute inset-x-0.5 overflow-hidden rounded px-1 text-[9.5px] leading-tight ${
                        TONE[b.kind] ?? "bg-line text-ink"
                      }`}
                      style={{ top: `${top}%`, height: `${height}%` }}
                    >
                      {height > 6 ? b.label : ""}
                    </span>
                  );
                })}

                {/* The open stretches are the answer to both questions. */}
                {d.free.map((f) => {
                  const top = pct(f.start);
                  const height = pct(f.end) - top;
                  if (height < 5) return null;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => onPick(iso, clock(tidy(f.start)))}
                      title={`${dur(f.end - f.start)} open from ${hhmm(f.start)}`}
                      className="absolute inset-x-0.5 rounded text-[9.5px] font-semibold text-ink-faint transition-colors hover:bg-accent-soft hover:text-accent"
                      style={{ top: `${top}%`, height: `${height}%` }}
                    >
                      {height > 9 ? `${dur(f.end - f.start)} free` : ""}
                    </button>
                  );
                })}

                {/* Where the thing being planned would land. */}
                {on && (
                  <span
                    className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded border-[1.5px] border-dashed border-accent bg-accent-soft px-1 text-[9.5px] font-semibold leading-tight text-accent-strong"
                    style={{
                      top: `${pct(startMin)}%`,
                      height: `${Math.max(pct(startMin + durationMin) - pct(startMin), 4)}%`,
                    }}
                  >
                    {hhmm(startMin)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
