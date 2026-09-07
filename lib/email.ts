import { Resend } from "resend";
import type { Booking } from "./types";

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
