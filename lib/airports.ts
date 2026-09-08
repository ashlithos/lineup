// Getting to and from an airport eats real hours that no confirmation email
// mentions, so the timetable has to add them itself.
//
// Two numbers per flight:
//   transitMin — door-to-terminal, from the operator's own published times
//                (rounded up, because a published best case isn't a plan)
//   buffer     — how long to be at the airport before departure, from the
//                traveller's own rule: 3h international, 2h domestic, 1.5h at a
//                small quiet airport.

export type AirportSize = "major" | "regional" | "small";

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string; // for deciding whether a flight is international
  /** Minutes between the terminal and the city centre. */
  transitMin: number;
  /** How that number was arrived at — shown on hover, so it's never a mystery. */
  transitVia: string;
  size: AirportSize;
}

export const AIRPORTS: Record<string, Airport> = {
  SFO: {
    code: "SFO", name: "San Francisco Intl", city: "San Francisco", country: "US",
    // BART is 30 min to the downtown stations; 35 allows for the walk and wait.
    transitMin: 35, transitVia: "BART, ~30 min to downtown", size: "major",
  },
  SJC: {
    code: "SJC", name: "San José Mineta", city: "San Jose", country: "US",
    // 6-7 min by car, ~15 by VTA light rail. Small and close in.
    transitMin: 20, transitVia: "~10 min by car, ~15 by VTA light rail", size: "regional",
  },
  LAS: {
    code: "LAS", name: "Harry Reid Intl", city: "Las Vegas", country: "US",
    transitMin: 25, transitVia: "10–20 min by car to the Strip", size: "major",
  },
  YYZ: {
    code: "YYZ", name: "Toronto Pearson", city: "Toronto", country: "CA",
    transitMin: 35, transitVia: "UP Express, 25–28 min to Union Station", size: "major",
  },
  YTZ: {
    code: "YTZ", name: "Billy Bishop", city: "Toronto", country: "CA",
    // On an island at the foot of downtown: 90-second ferry or a 6-minute tunnel.
    transitMin: 25, transitVia: "shuttle + 90-sec ferry or tunnel, ~15 min", size: "small",
  },
  YQB: {
    code: "YQB", name: "Québec City Jean Lesage", city: "Quebec City", country: "CA",
    transitMin: 30, transitVia: "~20 min by taxi, 30–40 at peak", size: "small",
  },
  YUL: {
    code: "YUL", name: "Montréal-Trudeau", city: "Montreal", country: "CA",
    transitMin: 45, transitVia: "747 bus 30–70 min, taxi 20–35 min", size: "major",
  },
};

/** Buffer at the airport before departure, in minutes. */
export function bufferMin(from: Airport, to: Airport | null): number {
  if (from.size === "small") return 90; // small, quiet — 1.5 h
  const international = !!to && to.country !== from.country;
  return international ? 180 : 120; // 3 h international, 2 h domestic
}

export function bufferReason(from: Airport, to: Airport | null): string {
  if (from.size === "small") return `${from.name} is small and quiet — 1.5 h`;
  return !!to && to.country !== from.country
    ? "International departure — 3 h"
    : "Domestic departure — 2 h";
}

const CODE = /\b([A-Z]{3})\b/g;

/** The airports a transport booking runs between, read from "SFO → YYZ". */
export function routeAirports(location?: string): {
  from: Airport | null;
  to: Airport | null;
} {
  const codes = [...(location ?? "").matchAll(CODE)]
    .map((m) => m[1])
    .filter((c) => AIRPORTS[c]);
  return { from: AIRPORTS[codes[0]] ?? null, to: AIRPORTS[codes[1]] ?? null };
}
