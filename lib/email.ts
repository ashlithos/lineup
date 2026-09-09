import { Resend } from "resend";
import type { Booking } from "./types";
import {
  bookByLabel,
  bookLinks,
  bookUrgency,
  handoffSubject,
  handoffText,
  leadTime,
  whenLabel,
} from "./handoff";

function fmtMoney(amount?: number, currency = "USD"): string {
  if (amount == null) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount}`;
  }
}

function fmtDeadline(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hoursLeft(iso: string, now: number): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 3_600_000));
}

export function renderReminder(bookings: Booking[], now: number) {
  const rows = bookings
    .map((b) => {
      const h = hoursLeft(b.cancelBy!, now);
      const left = h >= 24 ? `${Math.round(h / 24)} day(s)` : `${h} hour(s)`;
      const money = fmtMoney(b.amount, b.currency);
      const link = b.cancelUrl
        ? `<a href="${b.cancelUrl}" style="color:#c25b33">cancel</a>`
        : "";
      return `<tr>
        <td style="padding:10px 0;border-top:1px solid #e8e1d5">
          <div style="font-size:16px;color:#211c16;font-weight:600">${b.title}</div>
          <div style="font-size:13px;color:#5a5248;margin-top:2px">
            ${left} left · free until ${fmtDeadline(b.cancelBy!)}${money ? ` · ${money} at stake` : ""}
          </div>
        </td>
        <td style="padding:10px 0;border-top:1px solid #e8e1d5;text-align:right;vertical-align:top">${link}</td>
      </tr>`;
    })
    .join("");

  const subject =
    bookings.length === 1
      ? `Cancel by soon: ${bookings[0].title}`
      : `${bookings.length} cancellation deadlines coming up`;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#faf7f1;padding:28px">
    <div style="max-width:520px;margin:0 auto;background:#fffdfa;border:1px solid #e8e1d5;border-radius:14px;padding:24px 28px">
      <div style="font-family:Georgia,serif;font-size:26px;color:#211c16">LineUp</div>
      <p style="font-size:15px;color:#5a5248;margin:6px 0 18px">
        ${bookings.length === 1 ? "A booking is" : "Some bookings are"} about to pass the free-cancellation window. Keep ${bookings.length === 1 ? "it" : "them"} or back out while you still can.
      </p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="font-size:12px;color:#938979;margin-top:20px">You're getting this because the deadline is within 48 hours. — LineUp</p>
    </div>
  </div>`;

  return { subject, html };
}

export async function sendReminderEmail(bookings: Booking[], now: number) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.REMINDER_TO_EMAIL;
  if (!apiKey || !to) {
    return { ok: false, reason: "email-not-configured" as const };
  }
  const resend = new Resend(apiKey);
  const { subject, html } = renderReminder(bookings, now);
  const { error } = await resend.emails.send({
    from: process.env.REMINDER_FROM_EMAIL || "LineUp <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true as const };
}

// ——— Handing "still to book" to someone else ———————————————————————————————

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface HandoffEmail {
  /** Who's being asked — name only, for the greeting. */
  to?: string;
  /** Who's asking. */
  from?: string;
  /** Where confirmations get forwarded once each thing is booked. */
  forwardTo?: string;
  /** A nudge repeats an ask that already went out; the wording softens. */
  nudge?: boolean;
}

export function renderHandoff(
  bookings: Booking[],
  opts: HandoffEmail = {},
  now: number = Date.now(),
) {
  const items = [...bookings].sort((a, b) => a.eventAt.localeCompare(b.eventAt));

  const rows = items
    .map((b) => {
      const u = bookUrgency(b, now);
      const urgent = u === "overdue" || u === "now";
      const links = bookLinks(b)
        .map(
          (l) =>
            `<a href="${esc(l.url)}" style="color:#c25b33;text-decoration:none;margin-right:12px">${esc(l.label)} →</a>`,
        )
        .join("");
      return `<tr>
        <td style="padding:14px 0;border-top:1px solid #e8e1d5">
          <div style="font-size:16px;color:#211c16;font-weight:600">${esc(b.title)}</div>
          <div style="font-size:13px;color:#5a5248;margin-top:3px">
            ${esc(whenLabel(b))}${b.location ? ` · ${esc(b.location)}` : ""}
          </div>
          <div style="font-size:13px;margin-top:6px;color:${urgent ? "#c25b33" : "#5a5248"};font-weight:${urgent ? 600 : 400}">
            ${esc(bookByLabel(b, now))}
          </div>
          <div style="font-size:12px;color:#938979;margin-top:2px">${esc(leadTime(b.category).note)}</div>
          ${b.notes ? `<div style="font-size:12px;color:#938979;margin-top:4px">${esc(b.notes)}</div>` : ""}
          ${links ? `<div style="font-size:13px;margin-top:8px">${links}</div>` : ""}
        </td>
      </tr>`;
    })
    .join("");

  const subject = opts.nudge
    ? items.length === 1
      ? `Still to book: ${items[0].title}`
      : `Still to book — ${items.length} things`
    : handoffSubject(items);

  const forward = opts.forwardTo
    ? `forward the confirmation to <a href="mailto:${esc(opts.forwardTo)}" style="color:#c25b33">${esc(opts.forwardTo)}</a>`
    : "forward the confirmation email back";

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#faf7f1;padding:28px">
    <div style="max-width:520px;margin:0 auto;background:#fffdfa;border:1px solid #e8e1d5;border-radius:14px;padding:24px 28px">
      <div style="font-family:Georgia,serif;font-size:26px;color:#211c16">LineUp</div>
      <p style="font-size:15px;color:#5a5248;margin:6px 0 18px">
        ${opts.to ? `${esc(opts.to)} — ` : ""}${
          opts.nudge
            ? `a reminder about ${items.length === 1 ? "this one" : `these ${items.length}`}: ${items.length === 1 ? "it's" : "they're"} still not booked.`
            : `could you book ${items.length === 1 ? "this" : `these ${items.length}`}? Everything's decided — it just needs reserving.`
        }
      </p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="font-size:13px;color:#5a5248;margin:20px 0 0">
        Once each one is booked, ${forward} so it lands on the timetable.
      </p>
      <p style="font-size:12px;color:#938979;margin-top:16px">${opts.from ? `Sent by ${esc(opts.from)} via LineUp` : "Sent via LineUp"}</p>
    </div>
  </div>`;

  return { subject, html };
}

export async function sendHandoffEmail(
  bookings: Booking[],
  to: string,
  opts: HandoffEmail = {},
  now: number = Date.now(),
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return { ok: false as const, reason: "email-not-configured" as const };
  const resend = new Resend(apiKey);
  const { subject, html } = renderHandoff(bookings, opts, now);
  const { error } = await resend.emails.send({
    from: process.env.REMINDER_FROM_EMAIL || "LineUp <onboarding@resend.dev>",
    to,
    subject,
    html,
    // A reply should reach the person who asked, not the sending domain.
    ...(opts.forwardTo ? { replyTo: opts.forwardTo } : {}),
    text: handoffText(bookings, { to: opts.to, from: opts.from, forwardTo: opts.forwardTo }, now),
  });
  if (error) return { ok: false as const, reason: error.message };
  return { ok: true as const };
}
