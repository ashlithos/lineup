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
import { buildSheetGrid, gridCSV, gridTSV } from "@/lib/sheetGrid";

const SPAN = DAY_END - DAY_START;
const pct = (m: number) => ((m - DAY_START) / SPAN) * 100;

// Every tone carries its text at full ink strength: this grid was grey-on-grey
// at 9.5px, which is a picture of a timetable rather than a timetable.
const TONE: Record<Block["kind"], string> = {
  travel: "bg-line-strong text-ink",
  event: "bg-accent text-white",
  meal: "bg-ok-soft text-ok border border-ok/25",
  unknown: "bg-soon-soft text-soon border border-dashed border-soon/60",
  // Researched but not reserved: never a solid fill, so it can't be mistaken
  // for something someone is holding for you.
  hold: "border border-dashed border-accent text-accent bg-accent-soft/40",
  transit: "bg-line text-ink border border-line-strong",
  buffer: "bg-line/70 text-ink border border-line-strong",
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

/** Round up to the next half hour — nobody plans a thing for 11:04. */
const tidy = (m: number) => Math.ceil(m / 30) * 30;
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function WeekGrid({
  bookings,
  onOpen,
  onAddPlan,
}: {
  bookings: Booking[];
  onOpen: (b: Booking) => void;
  /** Clicking an open stretch starts a plan there, the way a calendar does. */
  onAddPlan?: (day?: string, time?: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [weather, setWeather] = useState<Record<string, Map<string, DayWeather>>>({});
  // Meal windows are always drawn now — the toggle made way for export.
  const days = buildWeek(bookings, { meals: true });

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

  const fileName = `${bookings[0]?.tripName ?? "trip"} timetable`
    .replace(/[^\w \-]/g, "")
    .trim();
  const grid = buildSheetGrid(days, bookings, fileName || "Timetable");

  // Tab-separated is what a spreadsheet expects off the clipboard, so this
  // pastes straight into Sheets or Excel as the same grid that's on screen.
  const copyTable = async () => {
    try {
      await navigator.clipboard.writeText(gridTSV(grid));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the export button still works */
    }
  };

  // A BOM so Excel reads the accents in "Québec" correctly. The anchor has to
  // be in the document, and the URL has to outlive the click, or Safari and
  // Firefox quietly drop the download.
  const downloadCSV = () => {
    const blob = new Blob(["\uFEFF" + gridCSV(grid)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName || "timetable"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  // Builds the sheet in Drive and opens it. Falls back to the CSV whenever
  // Google isn't available, so the button always does something.
  const exportSheet = async () => {
    setExporting(true);
    setExportNote(null);
    // Opened before the await: a tab opened after one is blocked as a popup.
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await fetch("/api/sheets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookings, title: fileName || "Timetable" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (res.ok && data.url) {
        if (tab) tab.location.href = data.url;
        else window.open(data.url, "_blank", "noopener");
        return;
      }
      tab?.close();
      if (data.error === "not-connected" || data.error === "reconnect") {
        setExportNote("connect");
      } else {
        setExportNote("csv");
        downloadCSV();
      }
    } catch {
      tab?.close();
      setExportNote("csv");
      downloadCSV();
    } finally {
      setExporting(false);
    }
  };

  const anyUnknown = days.some((d) => d.hasUnknown);

  return (
    <section className="rounded-xl border border-line bg-raised p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[13px] text-ink-soft">
          Open time each day, counted to {hhmm(PLAN_END)}
        </p>
        <div className="flex items-center gap-1.5">
          {onAddPlan && (
            <button
              onClick={() => onAddPlan()}
              className="flex items-center gap-1.5 rounded-full border border-accent bg-raised px-3 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              <i className="ti ti-plus text-[14px]" aria-hidden="true" />
              Add a plan
            </button>
          )}
          <button
            onClick={copyTable}
            className="flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
          >
            <i
              className={`ti text-[14px] ${copied ? "ti-check text-ok" : "ti-clipboard"}`}
              aria-hidden="true"
            />
            {copied ? "Copied" : "Copy table"}
          </button>
          <button
            onClick={exportSheet}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            <i className="ti ti-table-export text-[14px]" aria-hidden="true" />
            {exporting ? "Building sheet…" : "Export to Google Sheets"}
          </button>
        </div>
      </div>

      {exportNote === "connect" && (
        <p className="mb-3 rounded-lg border border-line bg-paper px-3 py-2 text-[12px] text-ink-soft">
          Google isn&apos;t connected yet.{" "}
          <a href="/api/gmail/connect" className="font-medium text-accent hover:underline">
            Connect Google
          </a>{" "}
          and the sheet will be built in your Drive. (Already connected for
          email? This asks again — the old permission didn&apos;t cover Sheets.)
        </p>
      )}
      {exportNote === "csv" && (
        <p className="mb-3 rounded-lg border border-line bg-paper px-3 py-2 text-[12px] text-ink-soft">
          Couldn&apos;t reach Google, so the same grid downloaded as a CSV —
          open it with File → Import in Sheets.
        </p>
      )}

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
          <div className="relative h-[340px] md:h-[440px] xl:h-[500px]">
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
              // A quiet ground instead of an outline: the day still reads as a
              // column, without a box drawn round everything on it.
              className="relative h-[340px] overflow-hidden rounded-lg bg-paper/70 md:h-[440px] xl:h-[500px]"
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
                className="absolute inset-x-0 bottom-0 bg-line/40"
                style={{ top: `${pct(PLAN_END)}%` }}
                title="Not counted — you don't plan anything this late"
                aria-hidden="true"
              />
              {d.blocks.map((b) => {
                const top = pct(b.start);
                const real = pct(b.end) - top;
                // A 15-minute ride is 1.5% of the day. Floor it so it stays
                // tappable, but keep the floor low enough that it can't swallow
                // the block beneath it.
                const height = Math.max(real, 3);
                const tall = height > 12;
                // Too short to hold a word: draw the bar, and let the tooltip,
                // the screen reader and a tap carry the meaning.
                const roomy = height >= 5;
                const when = `${hhmm(b.start)}${
                  b.kind === "unknown" ? " · end unknown" : `–${hhmm(b.end)}`
                }`;
                const inner = roomy ? (
                  <>
                    <span className="block truncate font-medium leading-tight">
                      {b.label}
                    </span>
                    {tall && (
                      <span className="block truncate leading-tight opacity-90">
                        {when}
                      </span>
                    )}
                  </>
                ) : null;
                const cls = `absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] ${TONE[b.kind]}`;
                // Taller blocks sit under shorter ones, so a sliver is never
                // buried by the block it abuts.
                const style = {
                  top: `${top}%`,
                  height: `${height}%`,
                  zIndex: Math.max(1, Math.round(40 - real)),
                };
                return b.booking ? (
                  <button
                    key={b.key}
                    onClick={() => onOpen(b.booking!)}
                    title={`${b.label} · ${when}`}
                    aria-label={`${b.label}, ${when}`}
                    className={`${cls} transition-opacity hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
                    style={style}
                  >
                    {inner}
                  </button>
                ) : (
                  <div
                    key={b.key}
                    className={cls}
                    style={style}
                    title={`${b.label} · ${when}`}
                    aria-label={`${b.label}, ${when}`}
                  >
                    {inner}
                  </div>
                );
              })}

              {/* The open stretches: the point of the whole view, and — since
                  they're the only place anything new can go — where you add. */}
              {d.free.map((f, i) => {
                const h = pct(f.end) - pct(f.start);
                if (h < 5) return null;
                const label = i === 0 ? "" : `${dur(f.end - f.start)} free`;
                const style = { top: `${pct(f.start)}%`, height: `${h}%` };
                if (!onAddPlan) {
                  return (
                    <span
                      key={f.key}
                      className="pointer-events-none absolute inset-x-0 flex items-center justify-center text-[11px] font-semibold text-ink-soft"
                      style={style}
                    >
                      {label}
                    </span>
                  );
                }
                return (
                  <button
                    key={f.key}
                    onClick={() =>
                      onAddPlan(d.date.slice(0, 10), clock(tidy(f.start)))
                    }
                    title={`Plan something here · ${hhmm(f.start)}–${hhmm(f.end)}`}
                    className="group absolute inset-x-0 flex items-center justify-center rounded-md text-[11px] font-semibold text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent"
                    style={style}
                  >
                    <span className="group-hover:hidden">{label}</span>
                    <span className="hidden items-center gap-1 group-hover:flex">
                      <i className="ti ti-plus text-[13px]" aria-hidden="true" />
                      Plan something
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-2.5">
        {[
          ["bg-paper/70", "free"],
          ["bg-line-strong", "travel"],
          ["bg-accent", "booked"],
          ["bg-line", "airport time"],
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
