import { isTransport, type Booking } from "./types";
import { localDate, localDayMs } from "./localtime";
import { outingGroups } from "./samePlace";

// Deterministic checks over the itinerary. These are the ones that must never
// be wrong — deadlines, overlaps, missing data — so they're plain code, not a
// model. The AI pass (see /api/plan-check) only adds real-world judgment.

export type Severity = "conflict" | "check" | "tidy";

export interface Finding {
  id: string; // stable fingerprint — used to remember dismissals
  severity: Severity;
  title: string;
  detail: string;
  bookingIds: string[];
  source: "rules" | "ai";
}

export const SEVERITY_ORDER: Severity[] = ["conflict", "check", "tidy"];

const DAY = 86_400_000;
const dayOf = localDayMs;
const fmt = (iso: string) =>
  localDate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// The place a booking happens, normalised for comparison. Flights use their
// destination; everything else its first location token.
function cityOf(b: Booking): string | null {
  let s = b.location ?? "";
  if (s.includes("→")) s = s.split("→").pop()!;
  if (s.includes("⇄")) return null; // round trip — no single city
  const c = s.split(",")[0].trim().toLowerCase();
  return c || null;
}

// Nights a hotel covers: check-in through the night before check-out.
function stayNights(b: Booking): number[] {
  if (b.category !== "hotel") return [];
  const start = dayOf(b.eventAt);
  if (!b.checkOut) return [start];
  const end = dayOf(b.checkOut);
  const out: number[] = [];
  for (let d = start; d < end; d += DAY) out.push(d);
  return out.length ? out : [start];
}

// The reservation number a booking carries, however the email phrased it.
// Codes are 5-12 chars, letters and digits, and must contain at least one
// digit — that filters out words like "ECONOMY" that follow "booking".
function confirmationOf(b: Booking): string | null {
  const notes = b.notes ?? "";
  const m = notes.match(
    /(?:confirmation|booking|reservation|order|trip)\s*(?:number|ref\.?|reference|code|id|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,11})\b/i,
  );
  const code = m?.[1]?.toUpperCase();
  if (!code || !/\d/.test(code)) return null;
  return code;
}

const overlaps = (a: string, b: string) =>
  a.includes(b) || b.includes(a) || a === b;

export function runRules(bookings: Booking[]): Finding[] {
  const found: Finding[] = [];
  const live = bookings.filter((b) => b.status === "upcoming");
  const hotels = live.filter((b) => b.category === "hotel");

  // Where you're sleeping each night, so we can test whether an event is
  // reachable from there.
  const nightCity = new Map<number, { city: string; b: Booking }>();
  for (const h of hotels) {
    const city = cityOf(h);
    if (!city) continue;
    for (const n of stayNights(h)) nightCity.set(n, { city, b: h });
  }

  // Days you've booked a way to get somewhere are day trips, not mistakes.
  const excursionDays = new Set(
    bookings
      .filter((b) => b.status !== "cancelled" && isTransport(b.category))
      .map((b) => dayOf(b.eventAt)),
  );

  // 1. An event somewhere you can't be — you're checked in elsewhere that night
  //    AND you have no transport booked that day. A dinner by the falls while
  //    your bed is in Toronto is a planned excursion when there's a train for
  //    it; it's only a conflict when there's no way to be in both places.
  for (const e of live) {
    if (e.category !== "event" && e.category !== "restaurant") continue;
    const where = nightCity.get(dayOf(e.eventAt));
    const evCity = cityOf(e);
    if (!where || !evCity) continue;
    if (overlaps(where.city, evCity)) continue;
    if (excursionDays.has(dayOf(e.eventAt))) continue;
    found.push({
      id: `away:${e.id}`,
      severity: "conflict",
      title: `You're staying elsewhere the night of "${e.title}"`,
      detail: `${e.title} is ${fmt(e.eventAt)} at ${e.location}, but you're checked into ${where.b.vendor ?? where.b.title} in ${where.b.location} that night.`,
      bookingIds: [e.id, where.b.id],
      source: "rules",
    });
  }

  // 2. Two different hotels booked for the same night.
  const byNight = new Map<number, Booking[]>();
  for (const h of hotels)
    for (const n of stayNights(h)) {
      if (!byNight.has(n)) byNight.set(n, []);
      byNight.get(n)!.push(h);
    }
  const seenPair = new Set<string>();
  for (const [n, hs] of byNight) {
    if (hs.length < 2) continue;
    for (let i = 0; i < hs.length; i += 1)
      for (let j = i + 1; j < hs.length; j += 1) {
        const a = hs[i];
        const b = hs[j];
        const ca = cityOf(a);
        const cb = cityOf(b);
        if (ca && cb && overlaps(ca, cb)) continue; // same place — likely a split reservation
        const key = [a.id, b.id].sort().join("|");
        if (seenPair.has(key)) continue;
        seenPair.add(key);
        found.push({
          id: `dblstay:${key}`,
          severity: "conflict",
          title: "Two hotels booked for the same night",
          detail: `${new Date(n).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: both ${a.vendor ?? a.title} (${a.location}) and ${b.vendor ?? b.title} (${b.location}).`,
          bookingIds: [a.id, b.id],
          source: "rules",
        });
      }
  }

  // 3. Refundable, but no deadline recorded — it silently never counts down.
  for (const b of live) {
    if (!b.refundable || b.cancelBy) continue;
    found.push({
      id: `nodeadline:${b.id}`,
      severity: "check",
      title: `No cancel deadline on "${b.title}"`,
      detail:
        "Marked refundable but has no free-cancellation date, so it never appears in your countdown.",
      bookingIds: [b.id],
      source: "rules",
    });
  }

  // 4. Hotel with no check-out — length of stay is a guess.
  for (const b of live) {
    if (b.category !== "hotel" || b.checkOut) continue;
    found.push({
      id: `nocheckout:${b.id}`,
      severity: "check",
      title: `No check-out date for ${b.vendor ?? b.title}`,
      detail: `Checks in ${fmt(b.eventAt)}; without a check-out LineUp can't tell how many nights, so trip totals under-count.`,
      bookingIds: [b.id],
      source: "rules",
    });
  }

  // 5. Midnight timestamps are almost always "time unknown", and they shift
  //    which day a booking lands on.
  for (const b of live) {
    if (!b.eventAt.includes("T00:00")) continue;
    if (b.eventAt.startsWith("9999")) continue; // undated plan sentinel
    found.push({
      id: `midnight:${b.id}`,
      severity: "tidy",
      title: `"${b.title}" has no time set`,
      detail: `Stored as midnight on ${fmt(b.eventAt)}, which usually means the time wasn't captured.`,
      bookingIds: [b.id],
      source: "rules",
    });
  }

  // 6a. Same confirmation code twice — the surest duplicate there is. A
  //     reservation number identifies one booking, so two rows carrying it are
  //     the same thing imported twice (usually a re-sync with a different title).
  const byConf = new Map<string, Booking[]>();
  for (const b of live) {
    const code = confirmationOf(b);
    if (!code) continue;
    if (!byConf.has(code)) byConf.set(code, []);
    byConf.get(code)!.push(b);
  }
  const dupedIds = new Set<string>();
  for (const [code, bs] of byConf) {
    if (bs.length < 2) continue;
    bs.forEach((b) => dupedIds.add(b.id));
    found.push({
      id: `dupeconf:${code}`,
      severity: "check",
      title: `Same reservation imported twice (${code})`,
      detail: `${bs.length} bookings share confirmation ${code} — "${bs.map((b) => b.title).join('" and "')}". One of them can go.`,
      bookingIds: bs.map((b) => b.id),
      source: "rules",
    });
  }

  // 6b. No confirmation code to compare, so fall back on vendor + day + amount.
  const dupe = new Map<string, Booking[]>();
  for (const b of live) {
    if (dupedIds.has(b.id)) continue; // already reported by code
    const k = `${b.category}|${(b.vendor ?? "").toLowerCase()}|${b.eventAt.slice(0, 10)}|${b.amount ?? "-"}`;
    if (!dupe.has(k)) dupe.set(k, []);
    dupe.get(k)!.push(b);
  }
  for (const [k, bs] of dupe) {
    if (bs.length < 2 || !bs[0].vendor) continue;
    if (bs[0].amount == null) continue; // award/points splits are legitimately separate
    found.push({
      id: `dupe:${k}`,
      severity: "check",
      title: `Possible duplicate: ${bs[0].vendor}`,
      detail: `${bs.length} identical bookings on ${fmt(bs[0].eventAt)} for the same amount. If you booked once, one of these can go.`,
      bookingIds: bs.map((b) => b.id),
      source: "rules",
    });
  }

  // 6c. The same journey twice. A flight imported from its confirmation email
  //     and again from a pasted itinerary rarely matches on price — one copy
  //     usually has none — so 6b never sees it. Two journeys on one day that
  //     leave at the same minute, or run the same route, are one journey.
  const journeys = live.filter((b) => isTransport(b.category) && !dupedIds.has(b.id));
  const seenJourneyPair = new Set<string>();
  for (const a of journeys) {
    for (const b of journeys) {
      if (a.id >= b.id) continue;
      if (a.eventAt.slice(0, 10) !== b.eventAt.slice(0, 10)) continue;
      const sameMinute = a.eventAt.slice(11, 16) === b.eventAt.slice(11, 16);
      const route = (x: Booking) => (x.location ?? "").toLowerCase().replace(/\s+/g, "");
      const sameRoute = !!route(a) && route(a) === route(b);
      if (!sameMinute && !sameRoute) continue;
      const pair = `${a.id}|${b.id}`;
      if (seenJourneyPair.has(pair)) continue;
      seenJourneyPair.add(pair);
      found.push({
        id: `dupejourney:${pair}`,
        severity: "check",
        title: `Same journey listed twice`,
        detail: `"${a.title}" and "${b.title}" both leave on ${fmt(a.eventAt)}${
          sameRoute ? " on the same route" : " at the same time"
        }. They're probably one booking imported twice — delete whichever has less detail.`,
        bookingIds: [a.id, b.id],
        source: "rules",
      });
    }
  }

  // 6d. The same outing under three names. A restaurant sends the booking, the
  //      confirmation and a reminder, and each subject line names the place
  //      differently — so there's no shared code (6a), usually no price (6b),
  //      and it isn't a journey (6c). Match on the words that name the place.
  //
  //      Four copies of one dinner are one problem, not six pairs of it, so
  //      they're grouped and reported once.
  const outings = live.filter((b) => !isTransport(b.category) && !dupedIds.has(b.id));
  for (const group of outingGroups(outings)) {
    const keep = group[0];
    found.push({
      id: `dupeouting:${group.map((b) => b.id).sort().join("|")}`,
      severity: "check",
      title:
        group.length === 2
          ? `"${keep.title}" is on here twice`
          : `"${keep.title}" is on here ${group.length} times`,
      detail: `${group
        .map((b) => `"${b.title}"`)
        .join(", ")} are all the same place on ${fmt(
        keep.eventAt,
      )} — one reservation that sent more than one email. "${keep.title}" has the most detail, so keep that one and drop the rest.`,
      bookingIds: group.map((b) => b.id),
      source: "rules",
    });
  }

  // 7. A trip that lands somewhere but never leaves (or vice versa).
  const byTrip = new Map<string, Booking[]>();
  for (const b of live) {
    if (!b.tripName) continue;
    if (!byTrip.has(b.tripName)) byTrip.set(b.tripName, []);
    byTrip.get(b.tripName)!.push(b);
  }
  for (const [name, bs] of byTrip) {
    const legs = bs.filter((b) => isTransport(b.category));
    const stays = bs.filter((b) => b.category === "hotel");
    if (!stays.length || legs.length !== 1) continue;
    const only = legs[0];
    if (only.checkOut) continue; // round trip already
    found.push({
      id: `oneway:${name}`,
      severity: "check",
      title: `"${name}" has only one travel leg`,
      detail: `${only.title} gets you there, but there's no return booked.`,
      bookingIds: [only.id],
      source: "rules",
    });
  }

  return sortFindings(found);
}

export function sortFindings(f: Finding[]): Finding[] {
  return [...f].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}

// Compact view of a booking for the model — metadata only. No confirmation
// codes, no payment details, no email bodies.
export function toModelShape(b: Booking) {
  const transport = isTransport(b.category);
  return {
    id: b.id,
    what: b.title,
    kind: b.category,
    where: b.location ?? null,
    // Same column means different things by type — spell it out, or the model
    // reads a flight's return date as a hotel check-out.
    ...(transport
      ? { departsAt: b.eventAt, returnsAt: b.checkOut ?? null }
      : { checkIn: b.eventAt, checkOut: b.checkOut ?? null }),
    trip: b.tripName ?? null,
  };
}
