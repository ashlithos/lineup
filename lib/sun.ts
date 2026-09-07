// Sunrise and sunset for a booking's city, computed rather than looked up:
// the standard sunrise equation is deterministic, needs no API key, and is
// accurate to about a minute — good enough to plan a day around.
//
// Two things it needs that a booking doesn't carry: coordinates and a time
// zone. Those come from the table below. A city that isn't in it returns null
// and the grid simply draws no lines — a wrong horizon is worse than none.

interface Place {
  lat: number;
  lon: number;
  tz: string;
}

// City-centre coordinates. Precision beyond a decimal or two is pointless here:
// moving across a city shifts sunrise by seconds.
const PLACES: [RegExp, Place][] = [
  [/toronto|yyz|ytz/i, { lat: 43.65, lon: -79.38, tz: "America/Toronto" }],
  [/montr[ée]al|yul|mtrl/i, { lat: 45.5, lon: -73.57, tz: "America/Toronto" }],
  [/qu[ée]bec|yqb|qbec/i, { lat: 46.81, lon: -71.21, tz: "America/Toronto" }],
  [/vancouver|yvr/i, { lat: 49.28, lon: -123.12, tz: "America/Vancouver" }],
  [/las vegas|\blas\b/i, { lat: 36.17, lon: -115.14, tz: "America/Los_Angeles" }],
  [/springdale|zion/i, { lat: 37.19, lon: -112.99, tz: "America/Denver" }],
  [/san francisco|\bsfo\b/i, { lat: 37.77, lon: -122.42, tz: "America/Los_Angeles" }],
  [/san jose|\bsjc\b/i, { lat: 37.34, lon: -121.89, tz: "America/Los_Angeles" }],
  [/roseville|sacramento/i, { lat: 38.75, lon: -121.29, tz: "America/Los_Angeles" }],
  [/kings beach|tahoe/i, { lat: 39.24, lon: -120.03, tz: "America/Los_Angeles" }],
  [/los angeles|\blax\b/i, { lat: 34.05, lon: -118.24, tz: "America/Los_Angeles" }],
  [/new york|\bjfk\b|\blga\b/i, { lat: 40.71, lon: -74.01, tz: "America/New_York" }],
  [/seattle|\bsea\b/i, { lat: 47.61, lon: -122.33, tz: "America/Los_Angeles" }],
  [/chicago|\bord\b/i, { lat: 41.88, lon: -87.63, tz: "America/Chicago" }],
  [/london|\blhr\b/i, { lat: 51.51, lon: -0.13, tz: "Europe/London" }],
  [/paris|\bcdg\b/i, { lat: 48.86, lon: 2.35, tz: "Europe/Paris" }],
  [/amsterdam|\bams\b/i, { lat: 52.37, lon: 4.9, tz: "Europe/Amsterdam" }],
  [/tokyo|\bhnd\b|\bnrt\b/i, { lat: 35.68, lon: 139.65, tz: "Asia/Tokyo" }],
  [/kyoto/i, { lat: 35.01, lon: 135.77, tz: "Asia/Tokyo" }],
  [/taipei|\btpe\b/i, { lat: 25.03, lon: 121.57, tz: "Asia/Taipei" }],
  [/hong kong|\bhkg\b/i, { lat: 22.32, lon: 114.17, tz: "Asia/Hong_Kong" }],
  [/shenzhen/i, { lat: 22.54, lon: 114.06, tz: "Asia/Shanghai" }],
  [/sydney|\bsyd\b/i, { lat: -33.87, lon: 151.21, tz: "Australia/Sydney" }],
];

export function placeFor(location?: string): Place | null {
  if (!location) return null;
  for (const [re, p] of PLACES) if (re.test(location)) return p;
  return null;
}

const RAD = Math.PI / 180;
const J2000 = 2451545;

/** Julian day for a UTC calendar date at midnight. */
function julian(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045 -
    0.5
  );
}

/**
 * Sunrise/sunset as UTC instants, via the standard sunrise equation.
 * Returns null inside a polar day or night, where neither happens.
 */
function sunUTC(
  dateISO: string,
  lat: number,
  lon: number,
): { rise: Date; set: Date } | null {
  const [y, m, d] = dateISO.slice(0, 10).split("-").map(Number);
  const nDays = julian(y, m, d) - J2000 + 0.0008;
  const lw = -lon;
  const n = Math.round(nDays - lw / 360);
  const jNoon = J2000 + lw / 360 + n; // approximate solar noon
  const M = (357.5291 + 0.98560028 * (jNoon - J2000)) % 360; // mean anomaly
  const C =
    1.9148 * Math.sin(M * RAD) +
    0.02 * Math.sin(2 * M * RAD) +
    0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360; // ecliptic longitude
  const jTransit =
    jNoon + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const decl = Math.asin(Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD));
  // -0.833° accounts for refraction and the sun's radius.
  const cosOmega =
    (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) /
    (Math.cos(lat * RAD) * Math.cos(decl));
  if (cosOmega > 1 || cosOmega < -1) return null; // sun never rises or never sets
  const omega = Math.acos(cosOmega) / RAD;
  const toDate = (j: number) => new Date((j - 2440587.5) * 86_400_000);
  return { rise: toDate(jTransit - omega / 360), set: toDate(jTransit + omega / 360) };
}

/** Minutes past midnight on a wall clock in `tz`. */
function minutesIn(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const mi = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) * 60 + mi;
}

/**
 * Local sunrise/sunset for a place on a date, as minutes past midnight —
 * the same units the week grid positions everything else in.
 */
export function sunTimes(
  location: string | undefined,
  dateISO: string,
): { sunrise: number; sunset: number } | null {
  const place = placeFor(location);
  if (!place) return null;
  const utc = sunUTC(dateISO, place.lat, place.lon);
  if (!utc) return null;
  return {
    sunrise: minutesIn(place.tz, utc.rise),
    sunset: minutesIn(place.tz, utc.set),
  };
}
