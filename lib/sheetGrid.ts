import type { Booking } from "./types";
import { DAY_START, DAY_END, type Block, type DayPlan } from "./freetime";
import { localDate, localDayMs } from "./localtime";

// The timetable as a spreadsheet grid: days across, hours down — the same shape
// as the on-screen week, and the shape a planning sheet is actually kept in.
// A flat "one row per entry" table is easy to generate and useless to read.

export type CellKind =
  | "label" // the dark row-header column
  | "header" // the date / weekday row
  | "travel"
  | "event"
  | "hold"
  | "meal"
  | "transit"
  | "buffer"
  | "unknown"
  | "place" // the city filling an otherwise open stretch of a day
  | "plain"; // hotel names, notes, anything unstyled

export interface GridCell {
  text: string;
  kind: CellKind;
  /** How many rows this cell spans. >1 becomes a merge in Sheets. */
  rowSpan: number;
}

/** `null` means "covered by the merge above" — no cell of its own. */
export type GridRow = (GridCell | null)[];

export interface SheetGrid {
  title: string;
  rows: GridRow[];
  /** Index of the first hour row, so the caller can size rows sensibly. */
  firstHourRow: number;
  hourCount: number;
}

const START_H = Math.floor(DAY_START / 60); // 7
const END_H = Math.floor(DAY_END / 60); // 23

const cell = (text: string, kind: CellKind = "plain", rowSpan = 1): GridCell => ({
  text,
  kind,
  rowSpan,
});

const dateLabel = (iso: string) =>
  localDate(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "numeric",
    day: "numeric",
  });
const dayLabel = (iso: string) =>
  localDate(iso).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });

// Which hour rows a block covers. A 9:30–10:15 block owns the 9 and 10 rows:
// an hour is "used" the moment anything reaches into it.
function rowsFor(b: Block): [number, number] {
  const first = Math.max(START_H, Math.floor(b.start / 60));
  const last = Math.min(END_H, Math.ceil(b.end / 60) - 1);
  return [first, Math.max(first, last)];
}

const DAY_MS = 86_400_000;

/** "Sapporo, Japan" → "Sapporo"; a route → where it lands. */
function cityOf(loc?: string): string | null {
  if (!loc) return null;
  const leg = loc.includes("\u2192") ? loc.split("\u2192").pop()! : loc;
  return leg.split(",")[0].trim() || null;
}

/** An open stretch shorter than this reads as a gap, not as "you are here". */
const MIN_PLACE_RUN = 3;

/** The stay covering the night of `dayMs`, if there is one. */
function stayOn(bookings: Booking[], dayMs: number): Booking | undefined {
  return bookings.find((b) => {
    if (b.category !== "hotel") return false;
    const from = localDayMs(b.eventAt);
    const to = b.checkOut ? localDayMs(b.checkOut) : from + DAY_MS;
    return dayMs >= from && dayMs < to;
  });
}

export function buildSheetGrid(
  days: DayPlan[],
  bookings: Booking[],
  title: string,
): SheetGrid {
  const cols = days.length;
  const hourRows = END_H - START_H + 1;
  const rows: GridRow[] = [];

  rows.push([cell("Date", "label"), ...days.map((d) => cell(dateLabel(d.date), "header"))]);
  rows.push([cell("Day", "label"), ...days.map((d) => cell(dayLabel(d.date), "header"))]);

  const firstHourRow = rows.length;
  for (let h = START_H; h <= END_H; h++) {
    rows.push([
      cell(`${String(h).padStart(2, "0")}:00`, "label"),
      ...Array.from({ length: cols }, () => cell("", "plain")),
    ]);
  }

  // Lay each day's blocks into its column. Blocks can overlap (an airport
  // buffer runs into its flight), so rows are claimed in order and a block
  // that has lost its first hours starts below whatever took them.
  days.forEach((day, i) => {
    const col = i + 1;
    let claimedTo = START_H - 1;
    for (const b of [...day.blocks].sort((x, y) => x.start - y.start)) {
      const [first, last] = rowsFor(b);
      const from = Math.max(first, claimedTo + 1);
      if (from > last) continue; // fully swallowed by the block before it
      const span = last - from + 1;
      const kind: CellKind =
        b.kind === "event" ||
        b.kind === "hold" ||
        b.kind === "meal" ||
        b.kind === "travel" ||
        b.kind === "transit" ||
        b.kind === "buffer"
          ? b.kind
          : "unknown";
      rows[firstHourRow + (from - START_H)][col] = cell(b.label, kind, span);
      for (let r = from + 1; r <= last; r++) rows[firstHourRow + (r - START_H)][col] = null;
      claimedTo = last;
    }
  });

  // An open run of hours says something on its own: it's where you are. Naming
  // the city there is what turns a grid of gaps into a day you can read.
  days.forEach((day, i) => {
    const col = i + 1;
    const lastArrival = Math.max(
      START_H - 1,
      ...day.blocks
        .filter((b) => b.kind === "travel" || b.kind === "transit")
        .map((b) => Math.ceil(b.end / 60) - 1),
    );
    let run = 0;
    let named: string | null = null; // name a city once a day, and again if it changes
    for (let h = START_H; h <= END_H + 1; h++) {
      const empty =
        h <= END_H && rows[firstHourRow + (h - START_H)][col]?.text === "";
      if (empty) {
        run++;
        continue;
      }
      if (run >= MIN_PLACE_RUN) {
        const from = h - run;
        // Before the day's last arrival you're still where you woke up.
        const city = cityOf(from > lastArrival ? (day.endPlace ?? day.place) : day.place);
        if (city && city !== named) {
          named = city;
          rows[firstHourRow + (from - START_H)][col] = cell(city, "place", run);
          for (let r = from + 1; r < h; r++) rows[firstHourRow + (r - START_H)][col] = null;
        }
      }
      run = 0;
    }
  });

  rows.push([
    cell("HOTEL", "label"),
    ...days.map((d) => cell(stayOn(bookings, localDayMs(d.date))?.title ?? "", "plain")),
  ]);
  // Left empty on purpose: the row exists so there's somewhere to write.
  rows.push([cell("NOTES", "label"), ...days.map(() => cell("", "plain"))]);

  return { title, rows, firstHourRow, hourCount: hourRows };
}

const flatten = (rows: GridRow[]) =>
  rows.map((r) => r.map((c) => (c ? c.text : "")));

/** Tab-separated — what a spreadsheet expects off the clipboard. */
export function gridTSV(grid: SheetGrid): string {
  return flatten(grid.rows)
    .map((r) => r.join("\t"))
    .join("\n");
}

/** CSV, quoted so a comma in a place name can't break a column. */
export function gridCSV(grid: SheetGrid): string {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return flatten(grid.rows)
    .map((r) => r.map(q).join(","))
    .join("\n");
}
