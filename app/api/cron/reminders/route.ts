import { NextResponse } from "next/server";
import { getSupabase, rowToBooking, TABLE, type BookingRow } from "@/lib/supabase";
import { sendReminderEmail } from "@/lib/email";

// Runs daily (see vercel.json). A booking is reminded when its free-cancellation
// deadline is within 48h and we haven't already reminded today — so you get a
// nudge ~48h out and again ~24h out, then it stops.
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
  if (due.length === 0) {
    return NextResponse.json({ sent: 0, checked: data?.length ?? 0 });
  }

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

  return NextResponse.json({ sent: bookings.length, titles: bookings.map((b) => b.title) });
}
