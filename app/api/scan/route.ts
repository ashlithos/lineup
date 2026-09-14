import { NextResponse } from "next/server";
import { googleAccessToken } from "@/lib/google";
import { extractCandidatesFromText } from "@/lib/extractServer";
import { isCancellation, sameBooking } from "@/lib/cancelMatch";
import { getIgnoredEmails } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
};
const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");
function gmailText(p?: GmailPart): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return decode(p.body.data);
  if (p.parts?.length) {
    const plain = p.parts.find((x) => x.mimeType === "text/plain" && x.body?.data);
    if (plain?.body?.data) return decode(plain.body.data);
    const joined = p.parts.map(gmailText).join("\n").trim();
    if (joined) return joined;
  }
  if (p.mimeType === "text/html" && p.body?.data) {
    return decode(p.body.data).replace(/<[^>]+>/g, " ");
  }
  return "";
}

const headerOf = (p: GmailPart | undefined, name: string) =>
  p?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
const subjectOf = (p?: GmailPart) => headerOf(p, "subject");

/**
 * What the model actually reads. Two things the raw body gets wrong:
 *
 * The subject line is the clearest statement a confirmation email makes —
 * "Your reservation at Yu Seafood Yorkdale is confirmed" — and it was never
 * sent. Bodies open with whatever the template felt like ("Your class is
 * booked"), which is worse than nothing.
 *
 * And a tracking URL can run to 700 characters. One Google Reserve email is
 * 2,600 characters of which 2,000 are four such links: the booking drowns in
 * them. Long ones go; short ones stay, because a cancellation link is worth
 * keeping.
 */
function emailForModel(p: GmailPart | undefined): string {
  const body = gmailText(p)
    .replace(/<?(https?:\/\/\S{120,})>?/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const head = [
    subjectOf(p) && `Subject: ${subjectOf(p)}`,
    headerOf(p, "date") && `Received: ${headerOf(p, "date")}`,
  ]
    .filter(Boolean)
    .join("\n");
  return head ? `${head}\n\n${body}` : body;
}

const key = (title: string, eventAt: string) =>
  `${title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 18)}|${eventAt.slice(0, 10)}`;

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const auth0 = await googleAccessToken();
  if ("error" in auth0) {
    return NextResponse.json({ error: auth0.error }, { status: 400 });
  }
  const auth = { Authorization: `Bearer ${auth0.token}` };

  // Travel-only: booking-shaped subjects OR known travel senders, minus the
  // promotions bucket. Keeps the results actual bookings, not trade/deposit/
  // shopping "confirmation" noise that used to bury real ones.
  const q = encodeURIComponent(
    'newer_than:21d -category:promotions (subject:(itinerary OR reservation OR "e-ticket" OR eticket OR "boarding pass" OR "booking ref" OR "booking #" OR "you\'re going" OR "trip to" OR "you\'re all set" OR "booking confirmation" OR "reservation confirmation" OR "confirmation #" OR cancelled OR canceled OR cancellation) OR from:(southwest.com OR united.com OR delta.com OR aa.com OR alaskaair.com OR flyporter.com OR jetblue.com OR aircanada.ca OR viarail.ca OR amtrak.com OR eurostar.com OR trainline.com OR airbnb.com OR hyatt.com OR marriott.com OR hilton.com OR ihg.com OR accor.com OR chasetravel.com OR expedia.com OR booking.com OR vrbo.com OR ticketmaster.com OR stubhub.com OR axs.com OR eventbrite.com OR seatgeek.com OR resy.com OR opentable.com))',
  );
  const list = (await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=15`,
    { headers: auth },
  ).then((r) => r.json())) as { messages?: { id: string }[] };
  // Anything whose booking you deleted is left where it is.
  const ignored = await getIgnoredEmails();
  const found = (list.messages ?? []).map((m) => m.id);
  const ids = found.filter((id) => !ignored.has(id)).slice(0, 15);
  const leftAlone = found.length - ids.length;

  // Existing bookings so we never add a duplicate.
  const existing = (await fetch(`${origin}/api/bookings`)
    .then((r) => r.json())
    .then((d) => d.bookings ?? [])
    .catch(() => [])) as {
    id: string;
    title: string;
    vendor?: string;
    eventAt: string;
    status: string;
  }[];
  const seen = new Set(existing.map((b) => key(b.title, b.eventAt)));

  const perEmail = await Promise.all(
    ids.map(async (id) => {
      const m = (await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: auth },
      ).then((r) => r.json())) as { payload?: GmailPart };
      const subject = subjectOf(m.payload);
      const cands = await extractCandidatesFromText(emailForModel(m.payload));
      const cancels = isCancellation(subject);
      // An email that yielded nothing is the interesting case: it matched the
      // search, so it looked like a booking, and then vanished without a word.
      if (!cands.length) return [{ c: null, id, cancels, subject }];
      return cands.map((c) => ({ c, id, cancels, subject }));
    }),
  );

  const added: string[] = [];
  const cancelled: string[] = [];
  // Anything the scan decided against, and why. Silence was indistinguishable
  // from "nothing new", which is the one thing it must never be mistaken for.
  const skipped: { subject: string; why: string }[] = [];
  for (const { c, id, cancels, subject } of perEmail.flat()) {
    if (!c) {
      skipped.push({ subject, why: "couldn't read a booking out of it" });
      continue;
    }
    if (!c.title || !c.eventAt) {
      skipped.push({ subject, why: c.eventAt ? "no name found" : "no date found" });
      continue;
    }
    if (c.confidence === "partial") {
      skipped.push({ subject, why: "too unsure to add" });
      continue;
    }

    // "Your reservation has been cancelled" is news about a booking you already
    // have, not a new one. Retire the match; never import the email itself.
    if (cancels) {
      const hit = existing.find(
        (b) =>
          (b.status === "upcoming" || b.status === "tobook") &&
          sameBooking(b, c),
      );
      if (hit) {
        await fetch(`${origin}/api/bookings/${hit.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
        hit.status = "cancelled"; // don't cancel it twice from a second email
        cancelled.push(hit.title);
      } else {
        skipped.push({ subject, why: "a cancellation for nothing on file" });
      }
      continue;
    }

    // Dedup only against already-saved bookings — never merge two candidates
    // from this scan, since same-route/same-day can be two real reservations
    // (e.g. two Southwest confirmations).
    if (seen.has(key(c.title, c.eventAt))) {
      skipped.push({ subject, why: "already on file" });
      continue;
    }
    await fetch(`${origin}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booking: {
          title: c.title,
          category: c.category,
          vendor: c.vendor ?? undefined,
          location: c.location ?? undefined,
          eventAt: c.eventAt,
          checkOut: c.checkOut ?? undefined,
          amount: c.amount ?? undefined,
          currency: c.currency || "USD",
          refundable: !!c.refundable,
          cancelBy: c.cancelBy ?? undefined,
          cancelUrl: c.cancelUrl ?? undefined,
          sourceUrl: `https://mail.google.com/mail/u/0/#all/${id}`,
          notes: c.notes ?? undefined,
          source: "email",
          status: "upcoming",
        },
      }),
    });
    added.push(c.title);
  }

  return NextResponse.json({
    scanned: ids.length,
    added,
    cancelled,
    skipped,
    leftAlone,
  });
}
