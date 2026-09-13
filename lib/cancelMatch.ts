// A confirmation email and its cancellation look almost identical — same
// vendor, same date, same restaurant. Telling them apart, and pairing the
// cancellation with the booking it retires, is all this file does.

// Read cancellations from the subject only. Every confirmation email carries a
// "Cancel booking" link in its body, so the body says nothing either way.
const CANCELLED = /\b(cancell?ed|cancellation|cancelling|canceling)\b/i;

// Words worth matching a cancellation against a saved booking: long enough to
// mean something, so "your" and "the" can't pair a restaurant with a hotel.
const keyWords = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length >= 4),
  );

/** Same day, and something in the name in common. */
export function sameBooking(
  b: { title: string; vendor?: string; eventAt: string },
  c: { title: string; vendor?: string | null; eventAt: string },
): boolean {
  if (b.eventAt.slice(0, 10) !== c.eventAt.slice(0, 10)) return false;
  const mine = keyWords(`${b.title} ${b.vendor ?? ""}`);
  for (const w of keyWords(`${c.title} ${c.vendor ?? ""}`)) {
    if (mine.has(w)) return true;
  }
  return false;
}

/** True when the subject says a reservation went away. */
export function isCancellation(subject: string): boolean {
  return CANCELLED.test(subject);
}
