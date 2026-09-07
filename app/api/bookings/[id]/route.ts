import { NextResponse } from "next/server";
import {
  getSupabase,
  rowToBooking,
  bookingToRow,
  TABLE,
  type BookingRow,
} from "@/lib/supabase";
import type { Booking } from "@/lib/types";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 501 });
  }
  const { id } = await params;
  const patch = (await req.json()) as Partial<Booking>;
  const { data, error } = await supabase
    .from(TABLE)
    .update(bookingToRow(patch))
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ booking: rowToBooking(data as BookingRow) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 501 });
  }
  const { id } = await params;
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
