import Anthropic from "@anthropic-ai/sdk";

// One model for both paths, so a screenshot and a paste of the same
// confirmation can't be read by two different readers.
const MODEL = "claude-haiku-4-5";

// One raw candidate as the model returns it (booking fields + meta).
export interface RawCandidate {
  title: string;
  category: "hotel" | "event" | "restaurant" | "flight" | "train" | "other";
  vendor: string | null;
  location: string | null;
  eventAt: string;
  checkOut: string | null;
  arriveAt: string | null;
  durationMin: number | null;
  needsBooking: boolean;
  amount: number | null;
  currency: string;
  refundable: boolean;
  cancelBy: string | null;
  cancelUrl: string | null;
  notes: string | null;
  confidence: "high" | "check" | "partial";
  missing: string[];
}

export function extractionSystem(today: string): string {
  return `You extract structured booking details from confirmation emails for an app called LineUp. Today is ${today}. Return ONLY valid JSON, no prose, matching:
{"candidates":[{"title":string,"category":"hotel"|"event"|"restaurant"|"flight"|"train"|"other","vendor":string|null,"location":string|null,"eventAt":string(ISO 8601),"checkOut":string(ISO 8601)|null,"arriveAt":string(ISO 8601)|null,"durationMin":number|null,"needsBooking":boolean,"amount":number|null,"currency":string,"refundable":boolean,"cancelBy":string(ISO)|null,"cancelUrl":string|null,"notes":string|null,"confidence":"high"|"check"|"partial","missing":string[]}]}
Rules:
- category "train" = rail travel (VIA Rail, Amtrak, Eurostar…), not "flight".
- eventAt = when the experience happens (hotel check-in, flight/train departure, show time). Required; infer the year if needed using today's date.
- checkOut = hotel check-out date as an ISO datetime, ONLY for category "hotel". NEVER invent it — but look hard before giving up, because a missing check-out breaks night counts and cancel tracking downstream:
  * Hotel confirmations almost always state it. Look for "Check-out", "Departure", "Check-out before 11:00 AM", or a date RANGE in a header/summary block such as "Tue, Sep 22 - Wed, Sep 23" or "Sep 22 – Sep 23, 1 night". In a range, the FIRST date is check-in and the SECOND is check-out.
  * If only a night count is given ("3 nights"), compute check-out = check-in + that many nights.
  * Only if none of the above appears, set null AND add "checkOut" to the "missing" array so the app can flag it.
- For a ROUND-TRIP flight or train, put the return departure in checkOut. One-way: null.
- durationMin = the journey length in MINUTES, for flights and trains. Itineraries often print it ("Est. Travel Time: 1h 30m", "Duration 6h 13m") — convert to minutes and use it. If it is not printed, compute it ONLY when departure and arrival are in the same time zone; otherwise set null. Never guess a flight time.
- arriveAt = when a flight or train LANDS/arrives, as an ISO datetime, for category "flight" and "train" only. Itineraries nearly always print it ("9:45 AM SJC → 11:15 AM LAS", "ARRIVES LAS 11:15 AM", "Arrival: 11:26"). Capture it in the arrival airport/station's local time. Set null for every other category and whenever the arrival genuinely is not stated — NEVER estimate a flight time.
- refundable = true only if the text states free cancellation is possible. If it says non-refundable, set false.
- cancelBy = the free-cancellation deadline as an ISO datetime, ONLY if the text states it. If not stated, set null and add "cancelBy" to missing. NEVER invent a deadline.
- cancelUrl = the link to view/manage the reservation from the email (itinerary / "view trip" / "manage booking" URL). Use the most specific deep link present; null if none.
- EVENTS ARE NOT TRIPS. A local event (concert, show, sports, dining) is a single booking; never imply an overnight.
- ONE CANDIDATE PER RESERVATION. If the text holds more than one distinct reservation — different confirmation numbers, different date ranges, or different payment methods (points/award vs cash) — return a SEPARATE candidate for each. NEVER merge them, even for the same hotel on back-to-back nights.
- payment method: when stated, record it in notes — "free-night award / points" (and set amount null) vs cash/paid (set amount). Keep each reservation's own cancellation policy in notes too.
- confidence: "high" if title+date+refundability are clear; "check" if a deadline or amount is missing; "partial" if unsure of the dates.
- If the text is marketing, a cancellation notice, a receipt for a completed/past thing, or not an upcoming booking, return {"candidates":[]}.`;
}

export async function extractCandidatesFromText(
  text: string,
): Promise<RawCandidate[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || text.trim().length < 20) return [];
  const anthropic = new Anthropic({ apiKey: key });
  const today = new Date().toISOString().slice(0, 10);
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: extractionSystem(today),
      messages: [{ role: "user", content: text.slice(0, 12000) }],
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    return (JSON.parse(json).candidates ?? []) as RawCandidate[];
  } catch {
    return [];
  }
}

/** What a screenshot adds that pasted text doesn't. */
const SCREENSHOT_NOTE = `The input is one or more SCREENSHOTS of a confirmation — a phone photo of an email, a booking page, or a message. Read every visible field, including text inside images and banners.
- Dates are often written as MM/DD/YYYY. Read them in that order unless the surrounding text makes DD/MM unmistakable.
- A time like "02:00PM" means 14:00. Combine the date and the start time into eventAt.
- "Arrive 30 minutes prior", "doors open", and check-in advice are NOT the start time. Keep the start time in eventAt and put the arrival advice in notes.
- A reference or booking number ("Ref.", "Confirmation #") belongs in notes.
- A name on the reservation belongs in notes, not in the title. The title is the place.
- A spa, bath house, class, tour or treatment is category "event".
- Screenshots are often cut off. If the total, the cancellation policy or the end time simply isn't visible, set it null and list it in "missing" — never infer one.`;

export async function extractCandidatesFromImages(
  images: { data: string; mediaType: string }[],
): Promise<RawCandidate[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !images.length) return [];
  const anthropic = new Anthropic({ apiKey: key });
  const today = new Date().toISOString().slice(0, 10);
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: `${extractionSystem(today)}\n\n${SCREENSHOT_NOTE}`,
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType as "image/png",
                data: img.data,
              },
            })),
            {
              type: "text" as const,
              text: "Extract every booking you can see in these screenshots.",
            },
          ],
        },
      ],
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    return (JSON.parse(json).candidates ?? []) as RawCandidate[];
  } catch {
    return [];
  }
}
