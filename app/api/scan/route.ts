import { NextResponse } from "next/server";
import { googleAccessToken } from "@/lib/google";
import { extractFromText, type RawCandidate } from "@/lib/extractServer";
import { isCancellation, sameBooking } from "@/lib/cancelMatch";
import { placeWords, sameOuting } from "@/lib/samePlace";
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


/**
 * A cancellation email that yielded no candidate still names its restaurant in
 * the subject ("Online Booking Cancelation for Chez Boulay-bistro boréal") and
 * usually repeats the date in the body. Match on the distinctive words of the
 * name, and only act when exactly one live booking answers to them — cancelling
 * the wrong dinner is far worse than missing one.
 */
function cancellationTarget(
  subject: string,
  body: string,
  existing: { id: string; title: string; vendor?: string; eventAt: string; status: string }[],
): { id: string; title: string; status: string } | null {
  const CANCEL_WORDS = new Set([
    "online", "cancelation", "cancellation", "cancelled", "canceled",
    "cancel", "notice", "confirmation", "reservation",
  ]);
  const named = placeWords(subject).filter((w) => !CANCEL_WORDS.has(w));
  if (!named.length) return null;

  const live = existing.filter(
    (b) => b.status === "upcoming" || b.status === "tobook",
  );
  let hits = live.filter((b) => {
    const words = placeWords(b.title, b.vendor);
    return words.length > 0 && words.every((w) => named.includes(w));
  });

  // More than one candidate? The body normally carries the date — use it.
  if (hits.length > 1) {
    const day = body.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    if (day) {
      const sameDay = hits.filter((b) => b.eventAt.slice(0, 10) === day);
      if (sameDay.length) hits = sameDay;
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

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
    category?: string;
    eventAt: string;
    status: string;
  }[];
  // Everything already on file, plus everything this scan adds as it goes: one
  // dinner can arrive as a booking, a confirmation and a reminder in the same
  // pass, and all three would otherwise land.
  const onFile = existing.map((b) => ({
    title: b.title,
    vendor: b.vendor,
    category: b.category,
    eventAt: b.eventAt,
  }));

  // Fifteen model calls at once is how a rate limit turns into nine emails
  // that "couldn't be read". Three at a time finishes comfortably inside the
  // 60s budget and actually gets answers.
  const perEmail: {
    c: RawCandidate | null;
    id: string;
    cancels: boolean;
    subject: string;
    failed: string | null;
    body: string;
  }[][] = [];
  const queue = [...ids];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      perEmail.push(await readOne(id));
    }
  });

  async function readOne(id: string) {
    const m = (await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: auth },
    ).then((r) => r.json())) as { payload?: GmailPart };
    const subject = subjectOf(m.payload);
    const body = emailForModel(m.payload);
    const out = await extractFromText(body);
    const cancels = isCancellation(subject);
    const failed = out.ok ? null : out.reason;
    const cands = out.ok ? out.candidates : [];
    // An email that yielded nothing is the interesting case: it matched the
    // search, so it looked like a booking, and then vanished without a word.
    if (!cands.length) return [{ c: null, id, cancels, subject, failed, body }];
    return cands.map((c) => ({ c, id, cancels, subject, failed, body }));
  }

  await Promise.all(workers);

  const added: string[] = [];
  const cancelled: string[] = [];
  // Anything the scan decided against, and why. Silence was indistinguishable
  // from "nothing new", which is the one thing it must never be mistaken for.
  const skipped: { subject: string; why: string }[] = [];
  // Emails the reader never managed to answer on. They are not junk and they
  // are not done — the next scan must try them again.
  const unread: string[] = [];
  for (const { c, id, cancels, subject, failed, body } of perEmail.flat()) {
    if (failed) {
      unread.push(subject);
      skipped.push({ subject, why: `${failed} — will try again next scan` });
      continue;
    }
    if (!c) {
      // The reader is told to return nothing for a cancellation notice, so a
      // cancellation almost never arrives with a candidate attached. Falling
      // through here is why a cancelled dinner stayed on the timetable.
      if (cancels) {
        const hit = cancellationTarget(subject, body, existing);
        if (hit) {
          await fetch(`${origin}/api/bookings/${hit.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "cancelled" }),
          });
          hit.status = "cancelled";
          cancelled.push(hit.title);
        } else {
          skipped.push({ subject, why: "a cancellation for nothing on file" });
        }
        continue;
      }
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

    // Same place, same day, same sort of thing — one outing, however
    // differently each email chose to name it. Two real reservations at one
    // restaurant in a day survive this, because their times differ.
    if (onFile.some((b) => sameOuting(b, { ...c, vendor: c.vendor ?? undefined }))) {
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
    onFile.push({
      title: c.title,
      vendor: c.vendor ?? undefined,
      category: c.category,
      eventAt: c.eventAt,
    });
  }

  return NextResponse.json({
    scanned: ids.length,
    added,
    cancelled,
    skipped,
    unread: unread.length,
    leftAlone,
  });
}
