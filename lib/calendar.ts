import type { Booking } from "./types";
import { formatMoney } from "./urgency";

// "Add to Google Calendar" template links. Opens GCal's new-event screen
// pre-filled; the user just hits Save. Times are written as "floating"
// (no Z) so the wall-clock time we stored (e.g. a 4:00 PM deadline) shows
// as that same time in the user's calendar.
function floating(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace(/[-:]/g, "");
}
function dateOnly(iso: string, addDays = 0): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function build(text: string, dates: string, details: string, location?: string) {
  const p = new URLSearchParams({ action: "TEMPLATE", text, dates, details });
  if (location) p.set("location", location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export function cancelDeadlineGcalUrl(b: Booking): string | null {
  if (!b.refundable || !b.cancelBy) return null;
  const start = floating(b.cancelBy);
  const end = floating(
    new Date(new Date(b.cancelBy).getTime() + 30 * 60000).toISOString(),
  );
  const money = b.amount != null ? ` · ${formatMoney(b.amount, b.currency)} at stake` : "";
  const details =
    `Free-cancellation deadline${money}. After this it's non-refundable.` +
    (b.cancelUrl ? `\nCancel here: ${b.cancelUrl}` : "") +
    `\n\n— LineUp`;
  return build(`Cancel-by: ${b.title}`, `${start}/${end}`, details, b.location);
}

export function tripGcalUrl(b: Booking): string {
  const allDay = b.category === "hotel" || b.category === "other";
  const dates = allDay
    ? `${dateOnly(b.eventAt)}/${dateOnly(b.eventAt, 1)}`
    : `${floating(b.eventAt)}/${floating(
        new Date(new Date(b.eventAt).getTime() + 2 * 3600000).toISOString(),
      )}`;
  const details =
    [b.vendor, b.notes].filter(Boolean).join("\n") + "\n\n— LineUp";
  return build(b.title, dates, details, b.location);
}
