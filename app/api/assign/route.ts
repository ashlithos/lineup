import { NextResponse } from "next/server";
import { sendHandoffEmail } from "@/lib/email";
import type { Booking } from "@/lib/types";

// Send the "still to book" list to whoever is going to book it. Returns 501
// when email isn't configured, so the client can fall back to copying the
// message or handing it to the OS share sheet.
export async function POST(req: Request) {
  const body = (await req.json()) as {
    to?: string;
    toName?: string;
    from?: string;
    forwardTo?: string;
    bookings?: Booking[];
  };

  const to = body.to?.trim();
  const bookings = body.bookings ?? [];
  if (!to || bookings.length === 0) {
    return NextResponse.json({ error: "missing-recipient-or-items" }, { status: 400 });
  }

  const result = await sendHandoffEmail(bookings, to, {
    to: body.toName?.trim() || undefined,
    from: body.from?.trim() || undefined,
    forwardTo: body.forwardTo?.trim() || undefined,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "email-not-configured" ? 501 : 502 },
    );
  }
  return NextResponse.json({ sent: bookings.length });
}
