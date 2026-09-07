import { isTransport, type Booking } from "./types";
import { collapseFlights, collapseStays, isFlightGroup, type FlightGroup } from "./flights";
import { localDayMs } from "./localtime";

// A trip reads as a sequence of cities with journeys between them — that's how
// people actually describe a trip ("three nights in Toronto, then the train to
// Montreal"). Chapters are the cities; legs are the moves.

export interface Chapter {
  kind: "chapter";
  key: string;
  city: string;
  start: string; // ISO — arrival / check-in
  end: string; // ISO — departure / check-out
  nights: number;
  stays: (Booking | FlightGroup)[];
  events: Booking[]; // anything else happening while you're in this city
}

export interface Leg {
  kind: "leg";
  key: string;
  booking: Booking; // the lead reservation
  group?: FlightGroup; // set when the leg was booked as several tickets
}

// A run of nights inside the trip with nowhere booked to sleep.
export interface Gap {
  kind: "gap";
  key: string;
  start: string;
  nights: number;
}

export type TimelineItem = Chapter | Leg | Gap;

const DAY = 86_400_000;
const dayOf = localDayMs;

// The city a stay is in — first token of the location, title-cased for display.
function cityOf(loc?: string): string {
  const raw = (loc ?? "").split(",")[0].trim();
  return raw || "Somewhere";
}
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const leadOf = (x: Booking | FlightGroup) => (isFlightGroup(x) ? x.lead : x);

export function buildTimeline(bookings: Booking[]): TimelineItem[] {
  const live = bookings.filter((b) => b.status !== "plan");
  const rawLegs = live
    .filter((b) => isTransport(b.category))
    .sort((a, b) => a.eventAt.localeCompare(b.eventAt));
  // Two tickets on one journey are one leg with a reservation row each.
  const legItems = collapseFlights(rawLegs).map((x) =>
    isFlightGroup(x)
      ? { kind: "leg" as const, key: x.key, booking: x.lead, group: x }
      : { kind: "leg" as const, key: `leg-${x.id}`, booking: x },
  );
  const legs = rawLegs;
  const others = live.filter(
    (b) => !isTransport(b.category) && b.category !== "hotel",
  );

  // Stays, with multi-reservation runs already chained into one.
  const stayItems = collapseStays(live.filter((b) => b.category === "hotel"))
    .filter((x) => leadOf(x).category === "hotel")
    .sort((a, b) => leadOf(a).eventAt.localeCompare(leadOf(b).eventAt));

  // Consecutive stays in the same city are one chapter, even across hotels.
  const chapters: Chapter[] = [];
  for (const item of stayItems) {
    const lead = leadOf(item);
    const city = cityOf(lead.location);
    const prev = chapters[chapters.length - 1];
    if (prev && norm(prev.city) === norm(city)) {
      prev.stays.push(item);
      if (lead.checkOut && lead.checkOut > prev.end) prev.end = lead.checkOut;
      continue;
    }
    chapters.push({
      kind: "chapter",
      key: `ch-${lead.id}`,
      city,
      start: lead.eventAt,
      end: lead.checkOut ?? lead.eventAt,
      nights: 0,
      stays: [item],
      events: [],
    });
  }

  // A stay with no check-out on file: run it to the next departure, else 1 night.
  for (const ch of chapters) {
    if (ch.end === ch.start) {
      const nextLeg = legs.find((l) => dayOf(l.eventAt) > dayOf(ch.start));
      ch.end = nextLeg ? nextLeg.eventAt : new Date(dayOf(ch.start) + DAY).toISOString();
    }
    ch.nights = Math.max(1, Math.round((dayOf(ch.end) - dayOf(ch.start)) / DAY));
  }

  // Everything else (shows, dinners) belongs to whichever chapter it falls in.
  const orphans: Booking[] = [];
  for (const e of others) {
    const d = dayOf(e.eventAt);
    const host = chapters.find(
      (ch) => d >= dayOf(ch.start) && d <= dayOf(ch.end),
    );
    if (host) host.events.push(e);
    else orphans.push(e);
  }
  for (const ch of chapters)
    ch.events.sort((a, b) => a.eventAt.localeCompare(b.eventAt));

  // A trip with no lodging at all (a run of local events) still needs a home.
  if (!chapters.length && orphans.length) {
    return orphans
      .sort((a, b) => a.eventAt.localeCompare(b.eventAt))
      .map((b) => ({ kind: "leg" as const, key: `orphan-${b.id}`, booking: b }))
      .concat(legItems)
      .sort((a, b) => a.booking.eventAt.localeCompare(b.booking.eventAt));
  }

  // Nights between two chapters with no bed booked — the app's original
  // "add a hotel" prompt, kept alive in the chapter layout.
  const gaps: Gap[] = [];
  for (let i = 0; i < chapters.length - 1; i += 1) {
    const endD = dayOf(chapters[i].end);
    const nextD = dayOf(chapters[i + 1].start);
    if (nextD > endD) {
      gaps.push({
        kind: "gap",
        key: `gap-${endD}`,
        start: new Date(endD).toISOString(),
        nights: Math.round((nextD - endD) / DAY),
      });
    }
  }

  const items: TimelineItem[] = [
    ...chapters,
    ...gaps,
    ...legItems,
    // An event outside every chapter still deserves a row rather than vanishing.
    ...orphans.map((b) => ({ kind: "leg" as const, key: `orphan-${b.id}`, booking: b })),
  ];

  // Order by day; on a shared day the journey comes before the city you land in.
  const rank = (i: TimelineItem) => (i.kind === "leg" ? 0 : i.kind === "gap" ? 2 : 1);
  return items.sort((a, b) => {
    const ad = dayOf(a.kind === "leg" ? a.booking.eventAt : a.start);
    const bd = dayOf(b.kind === "leg" ? b.booking.eventAt : b.start);
    if (ad !== bd) return ad - bd;
    return rank(a) - rank(b);
  });
}

// Trip-level totals for the sidebar. Days/nights come from the real span, not
// from how many rows the agenda happens to render.
export function tripTotals(bookings: Booking[]) {
  const live = bookings.filter((b) => b.status !== "plan");
  const stamps = live
    .flatMap((b) => [b.eventAt, b.checkOut])
    .filter((d): d is string => !!d)
    .map((d) => dayOf(d));
  if (!stamps.length) return { days: 0, nights: 0, stays: 0, legs: 0 };
  const nights = Math.round((Math.max(...stamps) - Math.min(...stamps)) / DAY);
  const stays = collapseStays(live.filter((b) => b.category === "hotel")).filter(
    (x) => leadOf(x).category === "hotel",
  ).length;
  return {
    days: nights + 1,
    nights,
    stays,
    legs: live.filter((b) => isTransport(b.category)).length,
  };
}
