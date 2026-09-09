import type { Booking, Category } from "./types";
import { localDate, localDayMs, localMins } from "./localtime";
import { hhmm } from "./freetime";

// Handing "still to book" to someone else. Three things have to travel with the
// list or the other person can't act on it: what and when, how early it has to
// be reserved, and where to go and do it.

const DAY = 86_400_000;

export interface LeadTime {
  /** How many days before the event it should be reserved. */
  days: number;
  /** Why — the sentence that goes in the message. */
  note: string;
}

// Rules of thumb, not truth. They exist so the message says "book by the 12th"
// instead of leaving someone to guess, and they're deliberately conservative:
// booking early is recoverable, booking late often isn't.
const LEAD: Record<Category, LeadTime> = {
  restaurant: {
    days: 30,
    note: "popular tables open exactly 30 days out and go in minutes — set an alarm for the drop",
  },
  event: {
    days: 45,
    note: "seats thin out as the date nears; the good ones go in the first week of sale",
  },
  hotel: {
    days: 60,
    note: "book a refundable rate early, then re-check the price closer to the date",
  },
  flight: { days: 60, note: "fares are usually at their best around two months out" },
  train: {
    days: 90,
    note: "cheap advance fares are released ~3 months out and sell out first",
  },
  trip: { days: 60, note: "the big pieces go first — lock these before the rest" },
  other: { days: 21, note: "three weeks is enough runway for most things" },
};

export const leadTime = (c: Category): LeadTime => LEAD[c] ?? LEAD.other;

/** The day this should be reserved by: the event date, minus its lead time. */
export function bookByMs(b: Booking): number {
  return localDayMs(b.eventAt) - leadTime(b.category).days * DAY;
}

export type BookUrgency = "overdue" | "now" | "soon" | "later";

export function bookUrgency(b: Booking, now: number = Date.now()): BookUrgency {
  const today = new Date(now);
  const todayMs = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const daysLeft = Math.round((bookByMs(b) - todayMs) / DAY);
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "now";
  if (daysLeft <= 7) return "soon";
  return "later";
}

const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/** "Book by Fri, Oct 10 — 30 days ahead", or the overdue version. */
export function bookByLabel(b: Booking, now: number = Date.now()): string {
  const { days } = leadTime(b.category);
  const u = bookUrgency(b, now);
  if (u === "overdue") return `Book now — this wanted ${days} days' notice`;
  if (u === "now") return `Book today — ${days} days ahead of the date`;
  return `Book by ${fmtDay(bookByMs(b))} — ${days} days ahead`;
}

/** "Sat, Oct 24 · 7:30 PM" — the day and time of the thing itself. */
export function whenLabel(b: Booking): string {
  const day = localDate(b.eventAt).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${day} · ${hhmm(localMins(b.eventAt))}`;
}

export interface BookLink {
  label: string;
  url: string;
}

const search = (q: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(q)}`;

/**
 * Where to go and book it. Anything saved on the item comes first — that's the
 * page it was researched from — then a couple of sensible starting points for
 * the category, so the message is actionable without any research at all.
 */
export function bookLinks(b: Booking): BookLink[] {
  const links: BookLink[] = [];
  // Nothing is reserved yet, so a "cancel" URL on a to-book item is really the
  // page it would be booked on — the plan dialog stores it that way too.
  if (b.cancelUrl) links.push({ label: "Booking page", url: b.cancelUrl });
  if (b.sourceUrl) links.push({ label: "Where this came from", url: b.sourceUrl });

  const what = [b.vendor || b.title, b.location].filter(Boolean).join(" ");
  switch (b.category) {
    case "restaurant":
      links.push(
        { label: "OpenTable", url: `https://www.opentable.com/s?term=${encodeURIComponent(b.vendor || b.title)}` },
        { label: "Resy", url: `https://resy.com/cities?query=${encodeURIComponent(b.vendor || b.title)}` },
        { label: "Search", url: search(`${what} reservation`) },
      );
      break;
    case "event":
      links.push(
        { label: "Ticketmaster", url: `https://www.ticketmaster.com/search?q=${encodeURIComponent(b.title)}` },
        { label: "Search", url: search(`${what} tickets`) },
      );
      break;
    case "hotel":
      links.push(
        { label: "Booking.com", url: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(what)}` },
        { label: "Search", url: search(`${what} hotel booking`) },
      );
      break;
    case "flight":
      links.push({ label: "Google Flights", url: "https://www.google.com/travel/flights" });
      break;
    case "train":
      links.push(
        { label: "Trainline", url: `https://www.thetrainline.com/` },
        { label: "Search", url: search(`${what} train tickets`) },
      );
      break;
    default:
      links.push({ label: "Search", url: search(`${what} book`) });
  }
  // Keep it short — a wall of links is the same as no links.
  return links.slice(0, 3);
}

export interface HandoffOptions {
  /** Who's being asked. */
  to?: string;
  /** Who's asking — used in the sign-off. */
  from?: string;
  /** Where confirmations should be forwarded once each thing is booked. */
  forwardTo?: string;
}

/**
 * The whole ask as plain text: paste-able into a message, readable in an email
 * client that strips HTML, and the thing the preview in the dialog shows.
 */
export function handoffText(
  items: Booking[],
  opts: HandoffOptions = {},
  now: number = Date.now(),
): string {
  const sorted = [...items].sort((a, b) => a.eventAt.localeCompare(b.eventAt));
  const lines: string[] = [];
  lines.push(
    `${opts.to ? `${opts.to} — c` : "C"}ould you book ${
      sorted.length === 1 ? "this" : `these ${sorted.length}`
    }?`,
  );
  lines.push("");
  for (const b of sorted) {
    lines.push(`• ${b.title}`);
    lines.push(`  When: ${whenLabel(b)}${b.location ? ` · ${b.location}` : ""}`);
    lines.push(`  ${bookByLabel(b, now)} (${leadTime(b.category).note})`);
    for (const l of bookLinks(b)) lines.push(`  ${l.label}: ${l.url}`);
    if (b.notes) lines.push(`  Note: ${b.notes}`);
    lines.push("");
  }
  lines.push(
    opts.forwardTo
      ? `Once each one is booked, forward me the confirmation email (${opts.forwardTo}) so it lands on the timetable.`
      : "Once each one is booked, forward me the confirmation email so it lands on the timetable.",
  );
  if (opts.from) lines.push(`— ${opts.from}`);
  return lines.join("\n");
}

/** Subject line shared by the handoff email and its later nudge. */
export function handoffSubject(items: Booking[]): string {
  return items.length === 1
    ? `Could you book: ${items[0].title}`
    : `${items.length} things to book`;
}
