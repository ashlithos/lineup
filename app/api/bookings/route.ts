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
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 501 });
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    bookings: (data as BookingRow[]).map(rowToBooking),
  });
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
