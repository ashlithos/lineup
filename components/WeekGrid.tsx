"use client";

import { useEffect, useState } from "react";
import type { Booking } from "@/lib/types";
import {
  buildWeek,
  DAY_START,
  DAY_END,
  PLAN_END,
  dur,
  hhmm,
  type Block,
} from "@/lib/freetime";
import { localDate } from "@/lib/localtime";
import { cityLabel, sunTimes } from "@/lib/sun";
import { forecastForPlaces, weatherLook, type DayWeather } from "@/lib/weather";

const SPAN = DAY_END - DAY_START;
const pct = (m: number) => ((m - DAY_START) / SPAN) * 100;

const TONE: Record<Block["kind"], string> = {
  travel: "bg-line-strong text-ink",
  event: "bg-accent text-white",
  meal: "bg-ok-soft text-ok border border-ok/25",
  unknown: "bg-soon-soft text-soon border border-dashed border-soon/60",
  // Researched but not reserved: never a solid fill, so it can't be mistaken
  // for something someone is holding for you.
  hold: "border border-dashed border-accent text-accent bg-accent-soft/40",
};

const weekday = (iso: string) =>
  localDate(iso).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
const dayNum = (iso: string) =>
  localDate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

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
  const [weather, setWeather] = useState<Record<string, Map<string, DayWeather>>>({});
  const days = buildWeek(bookings, { meals });

  // Forecasts only reach ~16 days out; beyond that this simply stays empty.
  const placeKey = days.map((d) => d.endPlace ?? d.place ?? "").join("|");
  useEffect(() => {
    let live = true;
    forecastForPlaces(placeKey.split("|"))
      .then((w) => live && setWeather(w))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [placeKey]);

  if (!days.length) return null;

  const anyUnknown = days.some((d) => d.hasUnknown);

  return (
    <section className="rounded-xl border border-line bg-raised p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[13px] text-ink-soft">
          Open time each day, counted to {hhmm(PLAN_END)}
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
          {days.map((d) => {
            const from = cityLabel(d.place);
            const to = cityLabel(d.endPlace);
            const where = from && to && from !== to ? `${from} → ${to}` : (to ?? from);
            return (
              <div key={`h-${d.key}`} className="pb-1 text-center">
                <div className="text-[12px] font-semibold text-ink">
                  {weekday(d.date)}
                </div>
                <div className="text-[10.5px] text-ink-faint">{dayNum(d.date)}</div>
                {where && (
                  <div
                    title={where}
                    className={`mt-0.5 truncate text-[10px] ${
                      from && to && from !== to
                        ? "font-medium text-accent"
                        : "text-ink-soft"
                    }`}
                  >
                    {where}
                  </div>
                )}
                {(() => {
                  const w = weather[d.endPlace ?? d.place ?? ""]?.get(
                    d.date.slice(0, 10),
                  );
                  if (!w) return null; // no forecast this far out — show nothing
                  const look = weatherLook(w.code);
                  return (
                    <div
                      title={`${look.label} · high ${w.high}° low ${w.low}°${w.rainChance >= 30 ? ` · ${w.rainChance}% chance of rain` : ""}`}
                      className="mt-0.5 flex items-center justify-center gap-1 text-[10px] text-ink-soft"
                    >
                      <span aria-hidden="true">{look.icon}</span>
                      <span className="font-mono">
                        {w.high}°/{w.low}°
                      </span>
                      {w.rainChance >= 30 && (
                        <span className="font-mono text-accent">
                          {w.rainChance}%
                        </span>
                      )}
                      <span className="sr-only">
                        {look.label}, high {w.high} degrees, low {w.low}
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })}

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
              className="relative h-[320px] overflow-hidden rounded-lg border border-line bg-raised"
            >
              {/* Daylight: the hours before sunrise and after sunset are shaded,
                  so the usable part of the day reads at a glance. Computed for
                  the city you're actually in that day. */}
              {(() => {
                // On a travel day the two ends are different cities, so take
                // sunrise where you woke and sunset where you'll sleep.
                const am = sunTimes(d.place, d.date);
                const pm = sunTimes(d.endPlace ?? d.place, d.date);
                if (!am && !pm) return null;
                const sun = { sunrise: am?.sunrise ?? pm!.sunrise, sunset: pm?.sunset ?? am!.sunset };
                const rise = Math.max(DAY_START, Math.min(DAY_END, sun.sunrise));
                const set = Math.max(DAY_START, Math.min(DAY_END, sun.sunset));
                const label = `Sunrise ${hhmm(sun.sunrise)} ${cityLabel(d.place) ?? ""} · sunset ${hhmm(sun.sunset)} ${cityLabel(d.endPlace ?? d.place) ?? ""}`;
                return (
                  <span title={label} aria-hidden="true">
                    {rise > DAY_START && (
                      <span
                        className="absolute inset-x-0 top-0 bg-ink/[0.045]"
                        style={{ height: `${pct(rise)}%` }}
                      />
                    )}
                    {set < DAY_END && (
                      <span
                        className="absolute inset-x-0 bottom-0 bg-ink/[0.045]"
                        style={{ top: `${pct(set)}%` }}
                      />
                    )}
                    {rise > DAY_START && (
                      <span
                        className="absolute inset-x-0 border-t border-dashed border-soon/70"
                        style={{ top: `${pct(rise)}%` }}
                      />
                    )}
                    {set < DAY_END && (
                      <span
                        className="absolute inset-x-0 border-t border-dashed border-soon/70"
                        style={{ top: `${pct(set)}%` }}
                      />
                    )}
                  </span>
                );
              })()}
              {/* After the planning cutoff — drawn, but never counted as free. */}
              <span
                className="absolute inset-x-0 bottom-0 bg-line/50"
                style={{ top: `${pct(PLAN_END)}%` }}
                title="Not counted — you don't plan anything this late"
                aria-hidden="true"
              />
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
                    className="pointer-events-none absolute inset-x-0 flex items-center justify-center text-[9.5px] font-semibold text-ink-soft"
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
          ["bg-raised border border-line", "free"],
          ["bg-line-strong", "travel"],
          ["bg-accent", "booked"],
          ["border border-dashed border-accent bg-accent-soft/40", "to book"],
          ["bg-ok-soft border border-ok/25", "meal window"],
        ].map(([c, label]) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className={`size-3 rounded-[3px] ${c}`} aria-hidden="true" />
            {label}
          </span>
        ))}
        {days.some((d) => sunTimes(d.place, d.date)) && (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span
              className="size-3 rounded-[3px] border border-line border-t-dashed border-t-soon/70 bg-ink/[0.045]"
              aria-hidden="true"
            />
            before sunrise / after sunset
          </span>
        )}
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
