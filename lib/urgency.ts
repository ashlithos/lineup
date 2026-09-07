import type { Booking } from "./types";
import { localDate, localDayMs } from "./localtime";

// The attention model, in code.
// Urgency is driven ONLY by refundable + cancelBy. Type never affects it.
export type Urgency = "urgent" | "soon" | "calm" | "locked" | "passed";

const HOUR = 1000 * 60 * 60;

// Tunable defaults — how far ahead each warning band reaches.
export const URGENT_HOURS = 48;
export const SOON_HOURS = 24 * 7;

export function getUrgency(b: Booking, now: number = Date.now()): Urgency {
  if (!b.refundable) return "locked"; // nothing to decide, ever
  if (!b.cancelBy) return "calm"; // refundable but no deadline noted yet
  const hoursLeft = (new Date(b.cancelBy).getTime() - now) / HOUR;
  if (hoursLeft < 0) return "passed"; // free-cancel window already closed
  if (hoursLeft <= URGENT_HOURS) return "urgent";
  if (hoursLeft <= SOON_HOURS) return "soon";
  return "calm";
}

// An item belongs in "Needs attention" only if there's still a live decision:
// refundable, with a cancel-by deadline that hasn't passed.
export function needsAttention(b: Booking, now: number = Date.now()): boolean {
  if (b.status !== "upcoming") return false;
  const u = getUrgency(b, now);
  return u === "urgent" || u === "soon" || u === "calm";
}

export interface Countdown {
  text: string; // "1 day", "6 hours", "3 days"
  past: boolean;
}

export function countdown(iso: string, now: number = Date.now()): Countdown {
  const diff = new Date(iso).getTime() - now;
  const past = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / (HOUR * 24));
  const hours = Math.floor(abs / HOUR);
  const mins = Math.floor(abs / (1000 * 60));
  let text: string;
  if (days >= 1) text = `${days} day${days === 1 ? "" : "s"}`;
  else if (hours >= 1) text = `${hours} hour${hours === 1 ? "" : "s"}`;
  else text = `${Math.max(mins, 1)} min${mins === 1 ? "" : "s"}`;
  return { text, past };
}

export function formatDeadline(iso: string): string {
  return localDate(iso).toLocaleString(undefined, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Whole nights between check-in and check-out, counted by calendar day so the
// time-of-day on each stamp can't nudge it off by one.
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((localDayMs(checkOut) - localDayMs(checkIn)) / (HOUR * 24));
}

export function formatEventDate(iso: string): string {
  return localDate(iso).toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatMoney(amount?: number, currency = "USD"): string | null {
  if (amount == null) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount}`;
  }
}
