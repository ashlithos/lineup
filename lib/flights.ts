import { isTransport, type Booking } from "./types";

// Two tickets on the identical flight (same airline, same route, same day) are
// separate reservations but one journey — the view merges them into a single
// card with a row per traveler. Everything stays separate underneath.

export interface FlightGroup {
  kind: "flight-group";
  key: string;
  lead: Booking; // representative for the shared flight facts
  tickets: Booking[]; // each its own reservation (confirmation, cancel policy…)
}

const flightKey = (b: Booking) =>
  `${b.vendor ?? ""}|${b.location ?? ""}|${b.eventAt.slice(0, 10)}`;

// Venue names vary by vendor ("SAP Center" vs "SAP Center at San Jose, San
// Jose, California"), so compare on the leading token and accept containment.
const venueKey = (loc?: string) =>
  (loc ?? "").toLowerCase().split(",")[0].replace(/[^a-z0-9 ]/g, "").trim();

const sameVenue = (a?: string, b?: string) => {
  const x = venueKey(a);
  const y = venueKey(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
};

// Two ticket orders are the same outing when they're on the same day at the
// same venue. Titles and vendors differ across resellers, so they can't be the
// match key — but date + venue is specific enough to be safe.
function sameEvent(a: Booking, b: Booking): boolean {
  return (
    a.category === "event" &&
    b.category === "event" &&
    a.eventAt.slice(0, 10) === b.eventAt.slice(0, 10) &&
    sameVenue(a.location, b.location)
  );
}

// Collapse duplicate reservations for the same thing — several tickets on one
// flight, or several ticket orders for one show — preserving order and leaving
// anything unmatched exactly as it was.
export function collapseFlights(items: Booking[]): (Booking | FlightGroup)[] {
  const groups = new Map<string, Booking[]>();
  const order: (string | Booking)[] = [];
  for (const b of items) {
    let key: string | null = null;
    if (isTransport(b.category)) {
      key = flightKey(b);
    } else if (b.category === "event") {
      // Reuse an existing event bucket when this order is the same outing.
      const hit = [...groups.entries()].find(
        ([, bs]) => bs[0].category === "event" && sameEvent(bs[0], b),
      );
      key = hit ? hit[0] : `event|${b.eventAt.slice(0, 10)}|${venueKey(b.location)}`;
    }
    if (!key) {
      order.push(b);
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(b);
  }
  return order.map((o) => {
    if (typeof o !== "string") return o;
    const tickets = groups.get(o)!;
    return tickets.length > 1
      ? { kind: "flight-group" as const, key: o, lead: tickets[0], tickets }
      : tickets[0];
  });
}

export const isFlightGroup = (x: Booking | FlightGroup): x is FlightGroup =>
  (x as FlightGroup).kind === "flight-group";

const hkey = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const sameHotel = (a: Booking, b: Booking) =>
  !!hkey(a.vendor) &&
  hkey(a.vendor) === hkey(b.vendor) &&
  hkey(a.location) === hkey(b.location);

// Back-to-back nights at one hotel booked as separate reservations (award
// nights, points runs) are a single stay. Chain them, and give the group a lead
// whose check-out spans the whole run so it reads "Sep 17 → 20 · 3 nights".
export function collapseStays(items: Booking[]): (Booking | FlightGroup)[] {
  const out: (Booking | FlightGroup)[] = [];
  const chains: Booking[][] = [];
  const rest: Booking[] = [];
  const hotels = [...items]
    .filter((b) => b.category === "hotel" && b.checkOut)
    .sort((a, b) => a.eventAt.localeCompare(b.eventAt));
  for (const b of items) if (!(b.category === "hotel" && b.checkOut)) rest.push(b);

  for (const b of hotels) {
    const prev = chains.find((c) => {
      const last = c[c.length - 1];
      return (
        last.checkOut!.slice(0, 10) === b.eventAt.slice(0, 10) &&
        sameHotel(last, b)
      );
    });
    if (prev) prev.push(b);
    else chains.push([b]);
  }

  for (const c of chains) {
    if (c.length === 1) {
      out.push(c[0]);
    } else {
      const lead: Booking = { ...c[0], checkOut: c[c.length - 1].checkOut };
      out.push({ kind: "flight-group", key: `stay-${c[0].id}`, lead, tickets: c });
    }
  }
  out.push(...rest);
  return out.sort((a, b) => {
    const av = isFlightGroup(a) ? a.lead.eventAt : a.eventAt;
    const bv = isFlightGroup(b) ? b.lead.eventAt : b.eventAt;
    return av.localeCompare(bv);
  });
}

// Pull the passenger name(s) and confirmation code out of the notes we store —
// no dedicated field, but the sync writes them in a stable shape.
export function flightMeta(b: Booking): {
  confirmation?: string;
  passengers?: string;
} {
  const notes = b.notes ?? "";
  const confirmation = notes.match(/confirmation\s+#?([A-Z0-9]{5,8})/i)?.[1];
  let passengers = notes
    .match(/passengers?:\s*([^(.\n]+)/i)?.[1]
    ?.trim()
    ?.replace(/\s+/g, " ");
  if (passengers && passengers.length > 44) passengers = undefined;
  return { confirmation, passengers };
}

// The seats an event order covers ("Section 209, Row 1, Seats 2-4"), condensed.
export function seatLabel(b: Booking): string | undefined {
  const notes = b.notes ?? "";
  const sec = notes.match(/section\s+([\w-]+)/i)?.[1];
  const row = notes.match(/row\s+([\w-]+)/i)?.[1];
  const seats = notes.match(/seats?\s+([\d–-]+(?:\s*[-–]\s*\d+)?)/i)?.[1];
  const parts = [
    sec && `Sec ${sec}`,
    row && `R${row}`,
    seats && `seat${seats.match(/[-–]/) ? "s" : ""} ${seats}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

// How one reservation inside a group is labelled: who it's for (flights) or
// which vendor and seats it covers (events).
export function ticketLabel(b: Booking): { main: string; detail?: string } {
  if (b.category === "event") {
    return { main: b.vendor || "Order", detail: seatLabel(b) };
  }
  const { confirmation, passengers } = flightMeta(b);
  return { main: passengers || "Ticket", detail: confirmation };
}
