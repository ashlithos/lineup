import { isTransport, type Booking } from "./types";
import { localDayMs } from "./localtime";

// Turns a trip's bookings into a day-by-day itinerary: what happens each day,
// which hotel you're sleeping in that night, and — the useful part — the nights
// with no stay booked at all (gaps).

export interface AgendaStay {
  booking: Booking; // the reservation covering tonight (the chain's first)
  night: number; // 1-based night index within this stay
  nights: number; // total nights in the stay (1 when unknown)
  unknownLength: boolean; // hotel has no check-out date yet
  reservations: Booking[]; // every booking making up this stay (award nights…)
  checkOut?: string; // end of the whole stay (last reservation's check-out)
}

export interface AgendaDay {
  key: string;
  date: string; // ISO at local midnight — for formatting the rail
  dayNum: number; // 1-based day of the trip
  events: Booking[]; // non-hotel bookings happening this day (flights, events…)
  stay: AgendaStay | null; // the hotel covering tonight, if any
  stayStart: boolean; // this stay checks in today (night 1)
  gap: boolean; // a night with no stay booked
  isLast: boolean; // final day — a departure, not a night to sleep
}

const DAY = 86_400_000;

// Use the UTC calendar date so day grouping is timezone-independent — dates are
// stored as calendar days (often UTC midnight), which otherwise drift a day in
// behind-UTC timezones.
const midnight = localDayMs;

interface Span {
  start: number; // first night (check-in, local midnight)
  end: number; // exclusive — first day NOT covered (check-out)
  nights: number;
  unknown: boolean;
}

// Same property — vendor + location, case/spacing tolerant.
const key = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
function sameHotel(a: Booking, b: Booking): boolean {
  return (
    key(a.vendor) === key(b.vendor) &&
    key(a.location) === key(b.location) &&
    !!key(a.vendor)
  );
}

function hotelSpan(b: Booking): Span | null {
  if (b.category !== "hotel") return null;
  const start = midnight(b.eventAt);
  if (!b.checkOut) return { start, end: start + DAY, nights: 1, unknown: true };
  const out = midnight(b.checkOut);
  const nights = Math.max(1, Math.round((out - start) / DAY));
  return { start, end: start + nights * DAY, nights, unknown: false };
}

export function tripDays(bookings: Booking[]): AgendaDay[] {
  if (!bookings.length) return [];

  // Only flag "no stay booked" nights when the trip actually involves travel —
  // a hotel or a flight. A group of local events needs no lodging.
  const lodgingBasis = bookings.some(
    (b) => b.category === "hotel" || isTransport(b.category),
  );

  const spans = new Map<string, Span>();
  for (const b of bookings) {
    const s = hotelSpan(b);
    if (s) spans.set(b.id, s);
  }

  // Back-to-back nights at the same hotel are one stay even when they're
  // separate reservations (e.g. three free-night awards). Chain them so the
  // agenda shows one block, with each reservation kept underneath.
  const chains = new Map<string, Booking[]>(); // lead booking id → reservations
  const chainOf = new Map<string, string>(); // any booking id → lead id
  const hotels = bookings
    .filter((b) => spans.has(b.id))
    .sort((a, b) => spans.get(a.id)!.start - spans.get(b.id)!.start);
  for (const b of hotels) {
    const s = spans.get(b.id)!;
    const prior = [...chains.entries()].find(([leadId, bs]) => {
      const last = bs[bs.length - 1];
      const ls = spans.get(last.id)!;
      return (
        ls.end === s.start &&
        !ls.unknown &&
        !s.unknown &&
        sameHotel(bookings.find((x) => x.id === leadId)!, b)
      );
    });
    if (prior) {
      prior[1].push(b);
      chainOf.set(b.id, prior[0]);
      const lead = spans.get(prior[0])!;
      lead.end = s.end;
      lead.nights += s.nights;
    } else {
      chains.set(b.id, [b]);
      chainOf.set(b.id, b.id);
    }
  }
  // Only the chain lead keeps a span — the rest are folded into it.
  for (const [id, leadId] of chainOf) if (id !== leadId) spans.delete(id);

  const dayStarts = bookings.map((b) => midnight(b.eventAt));
  const dayEnds = bookings.map((b) => {
    const s = spans.get(b.id);
    return s ? s.end - DAY : midnight(b.eventAt); // hotels end on their last night
  });
  const tripStart = Math.min(...dayStarts);
  const lastDay = Math.max(...dayEnds, ...dayStarts);

  const days: AgendaDay[] = [];
  let n = 0;
  for (let d = tripStart; d <= lastDay; d += DAY) {
    n += 1;
    const events = bookings
      .filter((b) => b.category !== "hotel" && midnight(b.eventAt) === d)
      .sort(
        (a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime(),
      );

    let stay: AgendaStay | null = null;
    for (const b of bookings) {
      const s = spans.get(b.id);
      if (s && d >= s.start && d < s.end) {
        stay = {
          booking: b,
          night: Math.round((d - s.start) / DAY) + 1,
          nights: s.nights,
          unknownLength: s.unknown,
          reservations: chains.get(b.id) ?? [b],
          checkOut: (chains.get(b.id) ?? [b]).at(-1)?.checkOut,
        };
        break;
      }
    }

    const isLast = d === lastDay;
    days.push({
      key: String(d),
      date: new Date(d).toISOString(),
      dayNum: n,
      events,
      stay,
      stayStart: !!stay && stay.night === 1,
      gap: lodgingBasis && !isLast && !stay,
      isLast,
    });
  }

  // Collapse a multi-night stay to a single row: drop the "middle" nights that
  // carry nothing but the same hotel continuing (no events, not a gap). The
  // check-in row shows the whole span, so the reservation reads as one thing.
  const kept = days.filter(
    (day) =>
      day.events.length > 0 ||
      day.gap ||
      !day.stay ||
      day.stayStart ||
      day.stay.nights === 1,
  );
  if (kept.length) {
    kept.forEach((day) => (day.isLast = false));
    kept[kept.length - 1].isLast = true;
  }
  return kept;
}
