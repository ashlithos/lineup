import { dur, hhmm, type DayPlan } from "./freetime";
import { cityLabel, sunTimes } from "./sun";
import { localDate } from "./localtime";

// The timetable as a table, for pasting into a spreadsheet. Free time is a row
// like any other — it's the column people actually plan against.

const KIND_LABEL: Record<string, string> = {
  travel: "Travel",
  transit: "Airport transit",
  buffer: "At airport",
  event: "Booked",
  hold: "To book",
  meal: "Meal",
  unknown: "Travel (end unknown)",
};

export const COLUMNS = [
  "Date",
  "Day",
  "Where",
  "Start",
  "End",
  "Length",
  "Type",
  "What",
  "Sunrise",
  "Sunset",
] as const;

const dateStr = (iso: string) =>
  localDate(iso).toLocaleDateString("en-CA", { timeZone: "UTC" }); // YYYY-MM-DD sorts properly
const weekday = (iso: string) =>
  localDate(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

export function timetableRows(days: DayPlan[]): string[][] {
  const rows: string[][] = [];
  for (const d of days) {
    const from = cityLabel(d.place);
    const to = cityLabel(d.endPlace);
    const where = from && to && from !== to ? `${from} → ${to}` : (to ?? from ?? "");
    const am = sunTimes(d.place, d.date);
    const pm = sunTimes(d.endPlace ?? d.place, d.date);

    const entries = [
      ...d.blocks.map((b) => ({
        start: b.start,
        end: b.end,
        type: KIND_LABEL[b.kind] ?? b.kind,
        what: b.label,
      })),
      ...d.free.map((f) => ({
        start: f.start,
        end: f.end,
        type: "Free",
        what: `${dur(f.end - f.start)} open`,
      })),
    ].sort((a, b) => a.start - b.start || a.end - b.end);

    if (!entries.length) {
      rows.push([dateStr(d.date), weekday(d.date), where, "", "", "", "Free", "Nothing booked", "", ""]);
      continue;
    }
    entries.forEach((e, i) => {
      rows.push([
        dateStr(d.date),
        weekday(d.date),
        where,
        hhmm(e.start),
        hhmm(e.end),
        dur(e.end - e.start),
        e.type,
        e.what,
        // Sun times belong to the day, so only the first row of each day carries them.
        i === 0 && am ? hhmm(am.sunrise) : "",
        i === 0 && pm ? hhmm(pm.sunset) : "",
      ]);
    });
  }
  return rows;
}

/** Tab-separated — what a spreadsheet expects from the clipboard. */
export function toTSV(rows: string[][]): string {
  return [COLUMNS.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
}

/** CSV, quoted so a comma in a place name can't break a column. */
export function toCSV(rows: string[][]): string {
  const cell = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return [
    COLUMNS.map(cell).join(","),
    ...rows.map((r) => r.map(cell).join(",")),
  ].join("\n");
}
