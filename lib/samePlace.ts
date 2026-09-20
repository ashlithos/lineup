// One dinner generates three emails: the reservation, the confirmation, and a
// reminder — each with a different subject line. "Restaurant La Buche",
// "La Buche"; "Lola Rosa (Milton)", "Lola Rosa Milton - Regular Class",
// "Regular Class at Lola Rosa Milton". Comparing the first 18 characters calls
// those six different bookings. Comparing the words that name the place calls
// them two.

/** Words that describe the booking rather than the place. */
const FILLER = new Set([
  "reservation", "reservations", "booking", "bookings", "confirmation",
  "confirmed", "restaurant", "restaurants", "table", "party", "guest",
  "guests", "class", "classes", "regular", "session", "seating", "reserved",
  "dinner", "lunch", "brunch", "breakfast", "your", "the", "for", "and",
  "with", "at",
]);

/** The distinctive words in a title, accent-folded and sorted. */
export function placeWords(title: string, vendor?: string | null): string[] {
  return [
    ...new Set(
      `${title} ${vendor ?? ""}`
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((w) => w.length >= 3 && !FILLER.has(w)),
    ),
  ].sort();
}

const minutesOf = (iso: string) => {
  const [h, m] = iso.slice(11, 16).split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

interface Outing {
  title: string;
  vendor?: string | null;
  category?: string;
  eventAt: string;
}

/**
 * Two rows for one outing: same day, same place, and — when both carry a real
 * time — close enough that they can't be a separate lunch and dinner.
 *
 * "Same place" allows one title to be a fuller version of the other, since the
 * reminder email usually says less than the confirmation did. It does not
 * allow an empty overlap, so two unrelated things on one day stay separate.
 */
export function sameOuting(a: Outing, b: Outing): boolean {
  if (a.eventAt.slice(0, 10) !== b.eventAt.slice(0, 10)) return false;
  if (a.category && b.category && a.category !== b.category) return false;

  const wa = placeWords(a.title, a.vendor);
  const wb = placeWords(b.title, b.vendor);
  if (!wa.length || !wb.length) return false;
  const [small, big] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (!small.every((w) => big.includes(w))) return false;

  // Midnight is how "no time given" is stored, so it can't rule anything out.
  const ma = minutesOf(a.eventAt);
  const mb = minutesOf(b.eventAt);
  if (ma && mb && Math.abs(ma - mb) > 120) return false;
  return true;
}

interface Groupable extends Outing {
  id: string;
  location?: string;
  amount?: number | null;
  sourceUrl?: string;
  notes?: string;
}

/**
 * Copies of one outing, grouped, keeper first. Four rows for one dinner are
 * one problem, not six pairs of it.
 *
 * The keeper is the copy that knows the most — a real time above all, since a
 * midnight timestamp is how "no time given" is stored, then whatever detail
 * came along with it.
 */
export function outingGroups<T extends Groupable>(rows: T[]): T[][] {
  const clusters: T[][] = [];
  for (const b of rows) {
    const home = clusters.find((c) => c.some((x) => sameOuting(x, b)));
    if (home) home.push(b);
    else clusters.push([b]);
  }
  const detail = (b: T) =>
    (b.eventAt.slice(11, 16) === "00:00" ? 0 : 4) +
    (b.location ? 1 : 0) +
    (b.amount != null ? 1 : 0) +
    (b.sourceUrl ? 1 : 0) +
    (b.notes ? 1 : 0);
  return clusters
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => detail(b) - detail(a)));
}
