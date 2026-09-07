import { NextResponse } from "next/server";
import { getConfig, setConfig } from "@/lib/config";
import { extractCandidatesFromText } from "@/lib/extractServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "not-connected" = never linked; "reconnect" = token exists but expired/revoked
// (Google expires refresh tokens weekly for unverified/"Testing" OAuth apps).
async function getAccessToken(): Promise<
  { token: string } | { error: "not-connected" | "reconnect" }
> {
  const refresh = await getConfig("gmail_refresh_token");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { error: "not-connected" };
  if (!refresh) return { error: "not-connected" };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const t = (await res.json()) as { access_token?: string };
  if (t.access_token) return { token: t.access_token };
  // Stored token is dead — drop it so status flips to disconnected and the UI re-prompts.
  await setConfig("gmail_refresh_token", "");
  return { error: "reconnect" };
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
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

const key = (title: string, eventAt: string) =>
  `${title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 18)}|${eventAt.slice(0, 10)}`;

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const auth0 = await getAccessToken();
  if ("error" in auth0) {
    return NextResponse.json({ error: auth0.error }, { status: 400 });
  }
  const auth = { Authorization: `Bearer ${auth0.token}` };

  // Travel-only: booking-shaped subjects OR known travel senders, minus the
  // promotions bucket. Keeps the results actual bookings, not trade/deposit/
  // shopping "confirmation" noise that used to bury real ones.
  const q = encodeURIComponent(
    'newer_than:21d -category:promotions (subject:(itinerary OR reservation OR "e-ticket" OR eticket OR "boarding pass" OR "booking ref" OR "booking #" OR "you\'re going" OR "trip to" OR "you\'re all set" OR "booking confirmation" OR "reservation confirmation" OR "confirmation #") OR from:(southwest.com OR united.com OR delta.com OR aa.com OR alaskaair.com OR flyporter.com OR jetblue.com OR aircanada.ca OR viarail.ca OR amtrak.com OR eurostar.com OR trainline.com OR airbnb.com OR hyatt.com OR marriott.com OR hilton.com OR ihg.com OR accor.com OR chasetravel.com OR expedia.com OR booking.com OR vrbo.com OR ticketmaster.com OR stubhub.com OR axs.com OR eventbrite.com OR seatgeek.com OR resy.com OR opentable.com))',
  );
  const list = (await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=15`,
    { headers: auth },
  ).then((r) => r.json())) as { messages?: { id: string }[] };
  const ids = (list.messages ?? []).map((m) => m.id).slice(0, 8);

  // Existing bookings so we never add a duplicate.
  const existing = (await fetch(`${origin}/api/bookings`)
    .then((r) => r.json())
    .then((d) => d.bookings ?? [])
    .catch(() => [])) as { title: string; eventAt: string }[];
  const seen = new Set(existing.map((b) => key(b.title, b.eventAt)));

  const perEmail = await Promise.all(
    ids.map(async (id) => {
      const m = (await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: auth },
      ).then((r) => r.json())) as { payload?: GmailPart };
      const cands = await extractCandidatesFromText(gmailText(m.payload));
      return cands.map((c) => ({ c, id }));
    }),
  );

  const added: string[] = [];
  for (const { c, id } of perEmail.flat()) {
    if (!c.title || !c.eventAt || c.confidence === "partial") continue;
    // Dedup only against already-saved bookings — never merge two candidates
    // from this scan, since same-route/same-day can be two real reservations
    // (e.g. two Southwest confirmations).
    if (seen.has(key(c.title, c.eventAt))) continue;
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

  return NextResponse.json({ scanned: ids.length, added });
}
