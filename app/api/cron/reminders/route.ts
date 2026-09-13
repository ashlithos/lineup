import { NextResponse } from "next/server";
import { getSupabase, rowToBooking, TABLE, type BookingRow } from "@/lib/supabase";
import { sendReminderEmail, sendHandoffEmail } from "@/lib/email";
import { bookUrgency } from "@/lib/handoff";
import type { SupabaseClient } from "@supabase/supabase-js";

// Runs daily (see vercel.json). Two passes:
//
//  1. Cancellation deadlines — a booking is reminded when its free-cancellation
//     deadline is within 48h and we haven't already reminded today, so you get a
//     nudge ~48h out and again ~24h out, then it stops.
//  2. Handed-off bookings — anything assigned to someone else that has reached
//     its recommended book-by date and still isn't reserved. They get the same
//     list they were sent, plus the reminder to forward the confirmation on.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 501 });
  }

  // ?test=1 — send a preview email using the soonest real deadlines, ignoring the
  // 48h window and NOT recording last_reminded_on. For verifying email delivery.
  if (new URL(req.url).searchParams.get("test")) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("status", "upcoming")
      .eq("refundable", true)
      .not("cancel_by", "is", null)
      .order("cancel_by", { ascending: true })
      .limit(3);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const bookings = (data as BookingRow[]).map(rowToBooking);
    if (bookings.length === 0) {
      return NextResponse.json({ test: true, sent: 0, note: "no refundable bookings" });
    }
    const r = await sendReminderEmail(bookings, Date.now());
    return NextResponse.json(
      { test: true, sent: r.ok ? bookings.length : 0, ...(r.ok ? {} : { error: r.reason }) },
      { status: r.ok ? 200 : 502 },
    );
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const in48hIso = new Date(now + 48 * 3_600_000).toISOString();
  const today = nowIso.slice(0, 10);

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("status", "upcoming")
    .eq("refundable", true)
    .not("cancel_by", "is", null)
    .gt("cancel_by", nowIso)
    .lte("cancel_by", in48hIso);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = (data as BookingRow[]).filter(
    (r) => r.last_reminded_on !== today,
  );

  let sent = 0;
  let titles: string[] = [];
  if (due.length > 0) {
    const bookings = due.map(rowToBooking);
    const result = await sendReminderEmail(bookings, now);
    if (!result.ok) {
      return NextResponse.json({ sent: 0, error: result.reason }, { status: 502 });
    }
    await supabase
      .from(TABLE)
      .update({ last_reminded_on: today })
      .in(
        "id",
        due.map((r) => r.id),
      );
    sent = bookings.length;
    titles = bookings.map((b) => b.title);
  }

  const nudged = await nudgeAssignees(supabase, now, today);

  return NextResponse.json({ sent, titles, checked: data?.length ?? 0, ...nudged });
}

/**
 * Chase whoever was asked to book something. One email per person, listing
 * everything of theirs that has hit its book-by date and still isn't reserved.
 * Reuses last_reminded_on for dedupe: a "tobook" row is never in the
 * cancellation pass, so the two can't fight over it.
 */
async function nudgeAssignees(
  supabase: SupabaseClient,
  now: number,
  today: string,
) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("status", "tobook")
    .not("assignee_email", "is", null)
    .gt("event_at", new Date(now).toISOString());
  if (error || !data) return { nudged: 0 };

  // Chase, don't nag: the book-by day, then every third day it stays unbooked.
  const NUDGE_GAP_DAYS = 3;
  const rows = (data as BookingRow[]).filter((r) => {
    if (r.last_reminded_on) {
      const since = (Date.parse(today) - Date.parse(r.last_reminded_on)) / 86_400_000;
      if (since < NUDGE_GAP_DAYS) return false;
    }
    const u = bookUrgency(rowToBooking(r), now);
    return u === "overdue" || u === "now";
  });
  if (rows.length === 0) return { nudged: 0 };

  // One message per person, not one per item.
  const byPerson = new Map<string, BookingRow[]>();
  for (const r of rows) {
    const key = r.assignee_email!;
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key)!.push(r);
  }

  let nudged = 0;
  const done: string[] = [];
  for (const [email, list] of byPerson) {
    const result = await sendHandoffEmail(
      list.map(rowToBooking),
      email,
      {
        to: list[0].assignee ?? undefined,
        forwardTo: process.env.REMINDER_TO_EMAIL,
        nudge: true,
      },
      now,
    );
    if (!result.ok) continue;
    nudged += list.length;
    done.push(...list.map((r) => r.id));
  }
  if (done.length) {
    await supabase.from(TABLE).update({ last_reminded_on: today }).in("id", done);
  }
  return { nudged };
}
