import { isTransport, type Booking } from "./types";
import { durationMin, localDayMs, localMins } from "./localtime";

// Turns a trip into a day-by-day picture of committed vs open time, so you can
// see at a glance where an activity would actually fit.

export const DAY_START = 7 * 60; // 07:00
export const DAY_END = 23 * 60; // 23:00
const MIN_FREE = 45; // a shorter gap isn't really usable

export type BlockKind = "travel" | "event" | "meal" | "unknown";

export interface Block {
  key: string;
  kind: BlockKind;
  label: string;
  start: number; // minutes from midnight
  end: number;
  booking?: Booking;
}

export interface FreeSlot {
  key: string;
  start: number;
  end: number;
}

export interface DayPlan {
  key: string;
  date: string; // ISO, UTC midnight
  blocks: Block[];
  free: FreeSlot[];
  freeMinutes: number;
  hasUnknown: boolean;
}

const DAY = 86_400_000;
const dayOf = localDayMs;
const minsOf = localMins;

export const hhmm = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === 0 ? `${h12}${ampm.toLowerCase()}` : `${h12}:${String(mm).padStart(2, "0")}${ampm.toLowerCase()}`;
};

export const dur = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
};

// How long a booking blocks the day when we have no explicit end.
const DEFAULT_LEN: Record<string, number> = {
  event: 150,
  restaurant: 105,
  other: 60,
};

// Typical meal windows. These are a display-only guide — never bookings, never
// written to your data — so they're only drawn where nothing else is scheduled.
const MEALS: [number, number, string][] = [
  [12 * 60, 13 * 60 + 30, "Lunch"],
  [19 * 60, 20 * 60 + 30, "Dinner"],
];

function clamp(v: number) {
  return Math.max(DAY_START, Math.min(DAY_END, v));
}

export function buildWeek(
  bookings: Booking[],
  opts: { meals: boolean } = { meals: true },
): DayPlan[] {
  const live = bookings.filter((b) => b.status !== "plan");
  if (!live.length) return [];

  const stamps = live
    .flatMap((b) => [b.eventAt, b.checkOut, b.arriveAt])
    .filter((d): d is string => !!d)
    .map(dayOf);
  const first = Math.min(...stamps);
  const last = Math.max(...stamps);

  const days: DayPlan[] = [];
  for (let d = first; d <= last; d += DAY) {
    const blocks: Block[] = [];
    let hasUnknown = false;

    for (const b of live) {
      if (b.category === "hotel") continue; // a stay anchors the night, it doesn't fill the day

      // Transport: departure → arrival. Outbound and the return leg both count.
      if (isTransport(b.category)) {
        const legs: { dep: string; arr?: string; tag: string }[] = [
          { dep: b.eventAt, arr: b.arriveAt, tag: "" },
        ];
        if (b.checkOut) legs.push({ dep: b.checkOut, arr: undefined, tag: " (return)" });
        for (const [i, leg] of legs.entries()) {
          if (dayOf(leg.dep) !== d) continue;
          const start = clamp(minsOf(leg.dep));
          const known = leg.arr && dayOf(leg.arr) === d;
          const end = known ? clamp(minsOf(leg.arr!)) : DAY_END;
          if (!known) hasUnknown = true;
          blocks.push({
            key: `${b.id}-${i}`,
            kind: known ? "travel" : "unknown",
            label: `${b.vendor ?? b.title}${leg.tag}`,
            start,
            end: Math.max(end, start + 30),
            booking: b,
          });
        }
        continue;
      }

      if (dayOf(b.eventAt) !== d) continue;
      const start = clamp(minsOf(b.eventAt));
      const len = DEFAULT_LEN[b.category] ?? 90;
      blocks.push({
        key: b.id,
        kind: "event",
        label: b.title,
        start,
        end: clamp(start + len),
        booking: b,
      });
    }

    blocks.sort((a, b) => a.start - b.start);

    // Meal windows fill only where nothing real is booked.
    if (opts.meals) {
      for (const [ms, me, label] of MEALS) {
        const clash = blocks.some((bl) => bl.start < me && bl.end > ms);
        if (!clash) blocks.push({ key: `meal-${d}-${label}`, kind: "meal", label, start: ms, end: me });
      }
      blocks.sort((a, b) => a.start - b.start);
    }

    // Whatever's left between 07:00 and 23:00 is open.
    const free: FreeSlot[] = [];
    let cursor = DAY_START;
    for (const bl of blocks) {
      if (bl.start - cursor >= MIN_FREE)
        free.push({ key: `f-${d}-${cursor}`, start: cursor, end: bl.start });
      cursor = Math.max(cursor, bl.end);
    }
    if (DAY_END - cursor >= MIN_FREE)
      free.push({ key: `f-${d}-${cursor}`, start: cursor, end: DAY_END });

    days.push({
      key: String(d),
      date: new Date(d).toISOString(),
      blocks,
      free,
      freeMinutes: free.reduce((n, f) => n + (f.end - f.start), 0),
      hasUnknown,
    });
  }
  return days;
}

// Same-city journeys (a train between two stops in one zone) can be subtracted
// safely; anything that changes city is assumed to risk a zone change.
function sameClock(b: Booking): boolean {
  const loc = b.location ?? "";
  const [from, to] = loc.split(/[→⇄]/).map((x) => x.trim().toLowerCase());
  return !!from && !!to && from === to;
}

// "6:35pm — 6h 13m — 9:48pm" for a transport card, when we know the landing.
export function legTimes(b: Booking): { dep: string; arr?: string; length?: string } {
  const dep = hhmm(minsOf(b.eventAt));
  if (!b.arriveAt) return { dep };
  // Only ever show a duration we actually know. eventAt and arriveAt are
  // wall-clock times at two different places, so the difference between them
  // is meaningless across time zones — a stored value or nothing.
  const mins =
    b.durationMin ?? (sameClock(b) ? durationMin(b.eventAt, b.arriveAt) : null);
  return {
    dep,
    arr: hhmm(minsOf(b.arriveAt)),
    length: mins ? dur(mins) : undefined,
  };
}
