import { NextResponse } from "next/server";
import {
  getSupabase,
  rowToBooking,
  bookingToRow,
  TABLE,
  type BookingRow,
} from "@/lib/supabase";
import type { Booking } from "@/lib/types";
import { gmailIdOf, ignoreEmail } from "@/lib/config";

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
  // Remember the email this came from before the row goes, so the next scan
  // doesn't hand it back. Deleting is the clearest "no" the app ever gets.
  const { data: row } = await supabase
    .from(TABLE)
    .select("source_url")
    .eq("id", id)
    .maybeSingle();
  const emailId = gmailIdOf((row as { source_url?: string } | null)?.source_url);
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (emailId) await ignoreEmail(emailId);
  return NextResponse.json({ ok: true, forgot: emailId ?? undefined });
}
