import { getSupabase, rowToBooking, TABLE, type BookingRow } from "@/lib/supabase";
import { CATEGORY_META, type Booking } from "@/lib/types";
import { countdown, formatMoney, getUrgency, needsAttention, type Urgency } from "@/lib/urgency";
import { localDate, localDayMs, localStamp } from "@/lib/localtime";
import { buildTrips } from "@/lib/trips";
import { buildWeek, hhmm } from "@/lib/freetime";
import { buildDensity, BUCKET_LABELS } from "@/lib/density";
import { runRules, sortFindings } from "@/lib/planCheck";
import { bookByLine, needsBooking } from "@/lib/handoff";

// Everything the /mcp tools return, built from the same lib/ rules the web
// app uses. Times stay wall-clock (see lib/localtime.ts); "now" is read on
// Ashley's clock rather than the server's UTC one.

const DAY = 86_400_000;
const MAX_ROWS = 20;

/**
 * Now, as a wall-clock stamp in `timeZone` — the server-side twin of
 * nowStamp(), which reads the device clock and so would be UTC on Vercel:
 * every deadline would look 7–8 hours later than it is in California.
 */
export function nowStampIn(timeZone: string, at: Date = new Date()): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    return nowStampIn("America/Los_Angeles", at);
  }
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
}

export async function loadBookings(): Promise<Booking[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Lineup's database isn't configured.");
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error) throw new Error(`Couldn't read Lineup: ${error.message}`);
  // Demo rows never belong in a real answer.
  return (data as BookingRow[]).map(rowToBooking).filter((b) => !b.isDemo);
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  localDate(iso).toLocaleString("en-US", { timeZone: "UTC", ...opts });
const dayLabel = (iso: string) => fmt(iso, { weekday: "short", month: "short", day: "numeric" });
const timeLabel = (iso: string) => fmt(iso, { hour: "numeric", minute: "2-digit" });
const money = (b: Booking) => formatMoney(b.amount, b.currency);
const emoji = (b: Booking) => CATEGORY_META[b.category]?.emoji ?? "📌";

// ── Cancel-by radar ─────────────────────────────────────────────────────────

export type RadarRow = {
  id: string;
  title: string;
  emoji: string;
  vendor: string | null;
  when: string;
  urgency: Urgency;
  left: string; // "1 day", "6 hours"
  deadline: string; // "Sun, Oct 18, 6:00 PM"
  amount: string | null;
  cancelUrl: string | null;
  kept: boolean;
};

export type Radar = {
  atStake: string | null;
  rows: RadarRow[];
  /** Refundable, but nobody noted the cancel-by date — worth looking up. */
  noDeadline: string[];
};

export function radar(bookings: Booking[], now: number, withinDays?: number): Radar {
  const live = bookings
    .filter((b) => needsAttention(b, now) && b.cancelBy)
    .filter((b) => !withinDays || localStamp(b.cancelBy!) - now <= withinDays * DAY)
    .sort((a, b) => localStamp(a.cancelBy!) - localStamp(b.cancelBy!));
  const rows = live.slice(0, MAX_ROWS).map((b) => ({
    id: b.id,
    title: b.title,
    emoji: emoji(b),
    vendor: b.vendor ?? null,
    when: dayLabel(b.eventAt),
    urgency: getUrgency(b, now),
    left: countdown(b.cancelBy!, now).text,
    deadline: fmt(b.cancelBy!, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    amount: money(b),
    cancelUrl: b.cancelUrl ?? null,
    kept: !!b.kept,
  }));
  const currency = live[0]?.currency ?? "USD";
  const sum = live.reduce((s, b) => s + (b.amount ?? 0), 0);
  const noDeadline = [
    ...new Set(bookings.filter((b) => needsAttention(b, now) && !b.cancelBy).map((b) => b.title)),
  ];
  return { atStake: sum ? formatMoney(sum, currency) : null, rows, noDeadline };
}

export function radarText(r: Radar): string {
  const missing = r.noDeadline.length
    ? `\nRefundable but no cancel-by date noted: ${r.noDeadline.join("; ")}.`
    : "";
  if (!r.rows.length) return `Nothing to decide: no refundable booking has an open free-cancellation window.${missing}`;
  const lines = r.rows.map(
    (x) =>
      `- ${x.title}: ${x.left} left to cancel free (by ${x.deadline})${x.amount ? `, ${x.amount} back` : ""}` +
      `${x.kept ? ", already marked keep" : ""} [id ${x.id}]`,
  );
  return `${r.rows.length} refundable booking${r.rows.length === 1 ? "" : "s"}${r.atStake ? `, ${r.atStake} at stake` : ""}, soonest deadline first:\n${lines.join("\n")}${missing}`;
}

// ── Plans: list · cards · timetable · year ────────────────────────────────

export type PlanItem = {
  id: string;
  title: string;
  emoji: string;
  day: string;
  meta: string;
  tag: string;
  tone: "ok" | "soon" | "urgent" | "tobook" | "calm";
};

export type Plans = {
  label: string;
  view: "list" | "cards" | "timetable" | "year";
  total: string | null;
  counts: { booked: number; toBook: number };
  items: PlanItem[];
  timetable: {
    trip: string;
    days: { label: string; place: string | null; blocks: { start: number; end: number; label: string; kind: string; time: string }[] }[];
  } | null;
  year: { buckets: string[]; months: { label: string; weeks: number[] }[] };
};

function inRange(b: Booking, from: number, to: number): boolean {
  const start = localDayMs(b.eventAt);
  const end = b.checkOut ? localDayMs(b.checkOut) : start;
  return end >= from && start <= to;
}

export function plans(
  bookings: Booking[],
  now: number,
  opts: { from?: string; to?: string; trip?: string; view?: Plans["view"] },
): Plans {
  const today = Math.floor(now / DAY) * DAY;
  const from = opts.from ? localDayMs(opts.from) : today;
  const to = opts.to ? localDayMs(opts.to) : from + 60 * DAY;
  const live = bookings.filter((b) => b.status === "upcoming" || b.status === "tobook");
  let picked = live.filter((b) => inRange(b, from, to));
  if (opts.trip) {
    const want = opts.trip.toLowerCase();
    const trip = buildTrips(live).find((t) => t.label.toLowerCase().includes(want));
    if (trip) picked = trip.bookings;
  }
  picked.sort((a, b) => localStamp(a.eventAt) - localStamp(b.eventAt));

  const items: PlanItem[] = picked.slice(0, MAX_ROWS).map((b) => {
    let tag = "Booked";
    let tone: PlanItem["tone"] = "ok";
    if (b.status === "tobook") {
      tag = "To book";
      tone = "tobook";
    } else if (needsAttention(b, now) && b.cancelBy) {
      const u = getUrgency(b, now);
      tag = `Free cancel ${countdown(b.cancelBy, now).text}`;
      tone = u === "urgent" ? "urgent" : u === "soon" ? "soon" : "calm";
    }
    const meta = [
      b.category === "hotel" && b.checkOut
        ? `${Math.round((localDayMs(b.checkOut) - localDayMs(b.eventAt)) / DAY)} nights`
        : timeLabel(b.eventAt),
      b.location,
      b.vendor,
    ]
      .filter(Boolean)
      .join(" · ");
    return { id: b.id, title: b.title, emoji: emoji(b), day: dayLabel(b.eventAt), meta, tag, tone };
  });

  // Timetable: the first trip in range with travel, as the web app's WeekGrid
  // draws it (buildWeek), capped to a week so it fits a phone.
  const trips = buildTrips(picked).filter((t) => !t.isOther);
  const trip = trips.find((t) => t.travel) ?? trips[0];
  const week = trip ? buildWeek(trip.bookings, { meals: false }).slice(0, 7) : [];
  const timetable = trip && week.length
    ? {
        trip: `${trip.label} · ${trip.dateRange}`,
        days: week.map((d) => ({
          label: new Date(d.date).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", day: "numeric" }),
          place: d.endPlace ?? d.place ?? null,
          blocks: d.blocks.map((x) => ({
            start: x.start,
            end: x.end,
            label: x.label,
            kind: x.booking?.status === "tobook" ? "tobook" : x.kind,
            time: hhmm(x.start),
          })),
        })),
      }
    : null;

  const sum = picked.reduce((s, b) => s + (b.amount ?? 0), 0);
  return {
    label: opts.trip && trip ? trip.label : rangeLabel(from, to),
    view: opts.view ?? "list",
    total: sum ? formatMoney(sum, picked[0]?.currency ?? "USD") : null,
    counts: {
      booked: picked.filter((b) => b.status === "upcoming").length,
      toBook: picked.filter((b) => b.status === "tobook").length,
    },
    items,
    timetable,
    year: {
      buckets: BUCKET_LABELS,
      months: buildDensity(live, 6, new Date(from)).map((m) => ({
        label: m.label,
        weeks: m.weeks.map((w) => w.days),
      })),
    },
  };
}

function rangeLabel(from: number, to: number): string {
  const f = (ms: number) => new Date(ms).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  return `${f(from)} – ${f(to)}`;
}

export function plansText(p: Plans): string {
  if (!p.items.length) return `Nothing booked or to book for ${p.label}.`;
  const lines = p.items.map((i) => `- ${i.day}: ${i.title} (${i.meta}) · ${i.tag} [id ${i.id}]`);
  return `${p.label}: ${p.counts.booked} booked, ${p.counts.toBook} to book${p.total ? `, ${p.total} total` : ""}.\n${lines.join("\n")}`;
}

// ── Plan check and to-book: text only ─────────────────────────────────────

export function checkPlanText(bookings: Booking[], from?: string, to?: string): string {
  const lo = from ? localDayMs(from) : -Infinity;
  const hi = to ? localDayMs(to) : Infinity;
  const scope = bookings.filter((b) => inRange(b, lo, hi));
  const findings = sortFindings(runRules(scope));
  if (!findings.length) return "No conflicts, missing legs or loose ends found by the rule checks.";
  return findings
    .map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`)
    .join("\n");
}

export function toBookText(bookings: Booking[], now: number): string {
  const list = bookings
    .filter((b) => b.status === "tobook" && needsBooking(b))
    .sort((a, b) => localStamp(a.eventAt) - localStamp(b.eventAt))
    .slice(0, MAX_ROWS);
  if (!list.length) return "Nothing left to book.";
  return list
    .map((b) => `- ${dayLabel(b.eventAt)}: ${b.title}${b.assignee ? ` (${b.assignee} is booking it)` : ""} · ${bookByLine(b, now) ?? ""} [id ${b.id}]`)
    .join("\n");
}
