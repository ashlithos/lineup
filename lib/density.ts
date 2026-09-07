import type { Booking } from "./types";

// "How packed am I?" — for each of the next N months, how many days have
// something on, bucketed into fifths of the month. Buckets are day-of-month
// ranges (1–7, 8–14, 15–21, 22–28, 29+) rather than real Mon–Sun weeks: a
// calendar month can straddle six Monday-weeks, which reads as a bug in a grid.

export const BUCKET_LABELS = ["1–7", "8–14", "15–21", "22–28", "29+"];

export interface DensityWeek {
  key: string;
  days: number; // days in this bucket with something booked
  from: number; // ms — first day of the bucket (for filtering)
  to: number; // ms — exclusive end of the bucket
}

export interface DensityMonth {
  key: string;
  label: string; // "Jul"
  year: number;
  days: number; // total booked days in the month
  count: number; // bookings touching the month
  weeks: DensityWeek[];
}

const DAY = 86_400_000;
const utcMidnight = (iso: string) => {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Every calendar day a booking occupies. Hotels cover check-in through the
// night before check-out; a flight or show is just its own day.
function occupiedDays(b: Booking): number[] {
  const start = utcMidnight(b.eventAt);
  if (b.category !== "hotel" || !b.checkOut) return [start];
  const end = utcMidnight(b.checkOut);
  const out: number[] = [];
  for (let d = start; d < end; d += DAY) out.push(d);
  return out.length ? out : [start];
}

// Does a booking touch [from, to)? Used to filter the list to a clicked bucket.
export function touchesRange(b: Booking, from: number, to: number): boolean {
  return occupiedDays(b).some((d) => d >= from && d < to);
}

export function buildDensity(
  bookings: Booking[],
  months = 6,
  from = new Date(),
): DensityMonth[] {
  const busy = new Map<number, Set<string>>(); // day → booking ids
  for (const b of bookings) {
    if (b.status !== "upcoming") continue; // plans have no real dates yet
    for (const d of occupiedDays(b)) {
      if (!busy.has(d)) busy.set(d, new Set());
      busy.get(d)!.add(b.id);
    }
  }

  const out: DensityMonth[] = [];
  const y0 = from.getUTCFullYear();
  const m0 = from.getUTCMonth();
  for (let i = 0; i < months; i += 1) {
    const y = y0 + Math.floor((m0 + i) / 12);
    const m = (m0 + i) % 12;
    const lastDate = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

    const weeks: DensityWeek[] = BUCKET_LABELS.map((_, bi) => {
      const startDate = bi * 7 + 1;
      const endDate = bi === BUCKET_LABELS.length - 1 ? lastDate : startDate + 6;
      return {
        key: `${y}-${m}-${bi}`,
        days: 0,
        from: Date.UTC(y, m, startDate),
        to: Date.UTC(y, m, Math.min(endDate, lastDate) + 1),
      };
    });

    let days = 0;
    const ids = new Set<string>();
    for (let date = 1; date <= lastDate; date += 1) {
      const hit = busy.get(Date.UTC(y, m, date));
      if (!hit?.size) continue;
      const bi = Math.min(Math.ceil(date / 7), BUCKET_LABELS.length) - 1;
      weeks[bi].days += 1;
      days += 1;
      hit.forEach((id) => ids.add(id));
    }

    out.push({
      key: `${y}-${m}`,
      label: new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      year: y,
      days,
      count: ids.size,
      weeks,
    });
  }
  return out;
}
