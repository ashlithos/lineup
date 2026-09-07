import { isTransport, type Booking } from "./types";

// Auto-group bookings into "trips" purely from the data — no stored trip field.
// A trip = a run of bookings close together in time. Lone bookings fall into
// an "Other" group. Trips are named by the destination cities involved.

export interface Trip {
  key: string;
  label: string; // e.g. "Toronto · Montreal", or "Other"
  dateRange: string; // e.g. "Sep 16–23"
  bookings: Booking[];
  isOther: boolean;
  custom: boolean; // true when the user named this trip
  travel: boolean; // has a hotel or flight — earns the day-by-day agenda
  image?: string; // user's custom trip photo, if any
}

function tripImage(bs: Booking[]): string | undefined {
  return bs.find((b) => b.imageUrl)?.imageUrl;
}

// A real trip involves travel — a hotel or a flight. A group of only events
// (e.g. two local shows) is not a trip and gets no agenda or hotel prompt.
function hasTravel(bs: Booking[]): boolean {
  return bs.some((b) => b.category === "hotel" || isTransport(b.category));
}

const DAY = 86_400_000;
const GAP_DAYS = 6; // a gap larger than this starts a new trip

function cityOf(loc?: string): string | null {
  if (!loc) return null;
  let s = loc;
  if (s.includes("→")) s = s.split("→").pop()!.trim(); // route → use destination
  const city = s.split(",")[0].trim();
  return city || null;
}

const norm = (s: string) => s.toLowerCase().trim();

// The destination cities a trip actually visits — taken from its lodging/event
// locations (flight "locations" are airport codes, too noisy to name a city).
function tripCities(bs: Booking[]): string[] {
  const out: string[] = [];
  for (const b of bs) {
    if (isTransport(b.category)) continue;
    const c = cityOf(b.location);
    if (c) out.push(norm(c));
  }
  return out;
}

// Should an un-named booking that falls inside a trip's dates actually join it?
// Hotels/flights in the window belong. A local event/meal only belongs if its
// city matches the trip — otherwise it's a same-week local plan that happens to
// overlap (e.g. a San Jose comedy show during a Vegas trip), not part of it.
function fitsTrip(b: Booking, cities: string[]): boolean {
  if (b.category === "hotel" || isTransport(b.category)) return true;
  const c = cityOf(b.location);
  if (!c || cities.length === 0) return true; // nothing to contradict — keep by date
  const cl = norm(c);
  return cities.some((tc) => tc.includes(cl) || cl.includes(tc));
}

function rangeLabel(bookings: Booking[]): string {
  // Include check-out / return dates so the range covers the whole trip, not
  // just the last thing that *starts* (a stay ending Dec 22 shouldn't read Dec 19).
  const ds = bookings
    .flatMap((b) => [b.eventAt, b.checkOut])
    .filter((d): d is string => !!d)
    .map((d) => new Date(d))
    .sort((a, b) => a.getTime() - b.getTime());
  const start = ds[0];
  const end = ds[ds.length - 1];
  const mon = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return start.getDate() === end.getDate()
      ? `${mon(start)} ${start.getDate()}`
      : `${mon(start)} ${start.getDate()}–${end.getDate()}`;
  }
  return `${mon(start)} ${start.getDate()} – ${mon(end)} ${end.getDate()}`;
}

function nameOf(bookings: Booking[]): string {
  // Prefer lodging/event cities (flight "routes" are airport codes — noisy names).
  const counts = new Map<string, number>();
  const add = (c: string | null) => {
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  };
  for (const b of bookings) if (b.category !== "flight") add(cityOf(b.location));
  if (counts.size === 0) for (const b of bookings) add(cityOf(b.location));
  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0]);
  if (sorted.length === 0) return "Trip";
  return (
    sorted.slice(0, 3).join(" · ") +
    (sorted.length > 3 ? ` +${sorted.length - 3}` : "")
  );
}

export function buildTrips(bookings: Booking[]): Trip[] {
  if (bookings.length === 0) return [];

  // User-named trips group by their custom name; the rest auto-cluster by date.
  const named = new Map<string, Booking[]>();
  const auto: Booking[] = [];
  for (const b of bookings) {
    if (b.tripName) {
      (named.get(b.tripName) ?? named.set(b.tripName, []).get(b.tripName)!).push(b);
    } else {
      auto.push(b);
    }
  }

  // Pull an un-named booking into a custom trip when its date lands inside that
  // trip's span (± a few days) — so a manually-added hotel groups itself without
  // the user having to re-type the trip name.
  const margin = GAP_DAYS * DAY;
  const spans = [...named.entries()].map(([name, bs]) => {
    const ts = bs.map((b) => new Date(b.eventAt).getTime());
    return {
      name,
      start: Math.min(...ts),
      end: Math.max(...ts),
      cities: tripCities(bs),
    };
  });
  const leftover: Booking[] = [];
  for (const b of auto) {
    const t = new Date(b.eventAt).getTime();
    const match = spans
      .filter((s) => t >= s.start - margin && t <= s.end + margin)
      .filter((s) => fitsTrip(b, s.cities))
      .sort(
        (a, c) =>
          Math.abs(t - (a.start + a.end) / 2) -
          Math.abs(t - (c.start + c.end) / 2),
      )[0];
    if (match) named.get(match.name)!.push(b);
    else leftover.push(b);
  }

  const trips: Trip[] = [];
  for (const [name, bs] of named) {
    trips.push({
      key: "named:" + name,
      label: name,
      dateRange: rangeLabel(bs),
      bookings: bs,
      isOther: false,
      custom: true,
      travel: hasTravel(bs),
      image: tripImage(bs),
    });
  }

  const sorted = [...leftover].sort(
    (a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime(),
  );
  const clusters: Booking[][] = [];
  let cur: Booking[] = [];
  let lastT = 0;
  for (const b of sorted) {
    const t = new Date(b.eventAt).getTime();
    if (cur.length && t - lastT > GAP_DAYS * DAY) {
      clusters.push(cur);
      cur = [];
    }
    cur.push(b);
    lastT = t;
  }
  if (cur.length) clusters.push(cur);

  // An auto-cluster only becomes a trip if it involves travel (a hotel or a
  // flight). A run of only events (e.g. two local shows) falls to Other cards.
  const others: Booking[] = [];
  for (const c of clusters) {
    if (c.length >= 2 && hasTravel(c)) {
      trips.push({
        key: c.map((b) => b.id).join("-"),
        label: nameOf(c),
        dateRange: rangeLabel(c),
        bookings: c,
        isOther: false,
        custom: false,
        travel: true,
        image: tripImage(c),
      });
    } else {
      others.push(...c);
    }
  }

  const earliest = (t: Trip) =>
    Math.min(...t.bookings.map((b) => new Date(b.eventAt).getTime()));
  trips.sort((a, b) => earliest(a) - earliest(b));

  if (others.length) {
    trips.push({
      key: "other",
      label: "Other",
      dateRange: "",
      bookings: others,
      isOther: true,
      custom: false,
      travel: false,
    });
  }
  return trips;
}
