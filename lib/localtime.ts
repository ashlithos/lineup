// Booking times are wall-clock times at the place they happen: a 6:35 PM
// departure from Montreal and a 9:48 PM landing in San Francisco are both
// "local". Reading them through UTC breaks two things — a flight that crosses
// midnight in UTC lands on the wrong calendar day, and any duration spanning
// time zones comes out wrong (YUL→SFO reads 3h13m instead of 6h13m).
//
// So: read the calendar date and clock time LITERALLY from the string, and
// compute durations from the true instant (which respects the offset).
// Values stored as "+00:00" behave exactly as before, so this is safe for
// every booking captured before offsets were recorded.

const PARTS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** The calendar date as written: "2026-09-23". */
export const localDateStr = (iso: string) => iso.slice(0, 10);

/** That calendar date as a UTC-midnight epoch, for grouping and arithmetic. */
export function localDayMs(iso: string): number {
  const m = PARTS.exec(iso);
  if (!m) {
    const d = new Date(iso);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

/** Minutes past midnight as written on the clock at that place. */
export function localMins(iso: string): number {
  const m = PARTS.exec(iso);
  if (!m) {
    const d = new Date(iso);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
  return +m[4] * 60 + +m[5];
}

/**
 * A Date positioned so that formatting it with `timeZone: "UTC"` prints the
 * original wall-clock values back out. Use this for every user-facing date.
 */
export const localDate = (iso: string) =>
  new Date(localDayMs(iso) + localMins(iso) * 60_000);

/** Real elapsed minutes between two stamps, honouring their offsets. */
export function durationMin(from: string, to: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const mins = Math.round((b - a) / 60_000);
  return mins > 0 ? mins : null;
}

/** True when a stamp carries a real (non-UTC) offset, i.e. we know its zone. */
export const hasOffset = (iso: string) => /[+-]\d{2}:\d{2}$/.test(iso) && !iso.endsWith("+00:00");
