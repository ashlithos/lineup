import { NextResponse } from "next/server";
import {
  getSupabase,
  rowToBooking,
  bookingToRow,
  TABLE,
  type BookingRow,
} from "@/lib/supabase";
import type { Booking } from "@/lib/types";

// 501 tells the client "not configured" → it falls back to localStorage.
// Any other failure means the database is there and didn't answer, which the
// client must never mistake for "you have no bookings".
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 501 });
  }

  // A sleeping or briefly unreachable database fails the first call and
  // answers the second. One retry costs a moment; not retrying costs the
  // whole list.
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: true });
    if (!error) {
      return NextResponse.json({
        bookings: (data as BookingRow[]).map(rowToBooking),
      });
    }
    lastError = error.message;
    // Log it: this used to fail with a bare 500 and no way to find out why.
    console.error(`GET /api/bookings attempt ${attempt + 1} failed:`, error);
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return NextResponse.json({ error: lastError }, { status: 500 });
}

export async function POST(req: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 501 });
  }
  const body = (await req.json()) as
    | { booking: Partial<Booking> }
    | { bookings: Partial<Booking>[] };

  const rows = "bookings" in body
    ? body.bookings.map(bookingToRow)
    : [bookingToRow(body.booking)];

  const { data, error } = await supabase
    .from(TABLE)
    .insert(rows)
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    bookings: (data as BookingRow[]).map(rowToBooking),
  });
}
