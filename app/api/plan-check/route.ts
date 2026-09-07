import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { Finding } from "@/lib/planCheck";

export const maxDuration = 30;

// The model half of the plan check. It only handles what rules can't: real-world
// judgment (is this reachable? is that connection tight?). Every finding must
// name booking ids that exist, or it's dropped — the model never gets to invent
// a booking, a date, or a place.

const SYSTEM = `You review travel itineraries for practical problems that require REAL-WORLD KNOWLEDGE. You get a list of bookings as JSON.

Be conservative. Most itineraries are fine. Returning {"findings":[]} is a good, common answer. A false alarm is worse than a missed nitpick — the user stops trusting the feature.

REPORT ONLY these, and only when the numbers actually justify it:
1. DISTANCE — a stay or event far from where the traveller arrives (roughly 80km/50mi or more) with no rental car, train, or transfer booked. This is the most valuable check: compare every arrival airport/station to that night's accommodation city.
   Do NOT state any distance or duration figure — no mileage, no hour count, no ranges. Your estimates are not reliable enough and a wrong number destroys trust. Say only that it is "a long drive" or "not close to the airport" and let the user look up the specifics. Naming the two places is the useful part.
2. IMPOSSIBLE OR VERY TIGHT CONNECTIONS — under ~90 minutes between an arrival and the next departure, or under ~2 hours between a hotel checkout and a flight departure in a different city. Anything looser than that is FINE — do not report it.
3. UNREACHABLE — a booking in a city with no plausible way to get there from the previous night's city.
4. SEASONAL/PRACTICAL — something that would genuinely derail the trip (a road or park closed in that season, a border/visa basic).

NEVER REPORT:
- A comfortable gap. Several hours between an arrival and a check-in is normal and good. Do not flag it.
- Missing check-out dates, missing prices, missing cancellation deadlines, midnight timestamps, duplicates, or past dates. Deterministic code already handles all of these. Reporting them is a bug.
- "Confirm this is intentional" style hedges with no concrete problem behind them.
- ANY comment about timestamps, midnight times, data entry, or fields being null/missing. That is not your job and it is already covered. If the only thing you can say about a booking is that its data looks odd, say nothing about it.

WRITING THE FINDING:
- NEVER put a booking id in the title or detail. Refer to bookings by their "what" name and place, as a person would: "SpringHill Suites in Springdale, UT", not "Hotel 5I198".
- Put the ids ONLY in the bookingIds array.
- State the concrete fact that makes it a problem (the distance, the number of minutes), then what's missing.
- Never invent a date, price, place, or booking that is not in the input.

SEVERITY — be strict:
- "conflict" = the plan genuinely CANNOT work as booked (overlapping in two places, a connection that cannot be made).
- "check" = it can work, but something practical is missing or tight. Distance-with-no-transport is "check", not "conflict".

FIELD MEANINGS:
- Transport (flight/train) has "departsAt" and, for a round trip, "returnsAt" — returnsAt is the RETURN journey home, not a check-out.
- Stays have "checkIn" and "checkOut".

Reply with JSON only:
{"findings":[{"severity":"conflict"|"check","title":string,"detail":string,"bookingIds":string[]}]}`;

interface ModelFinding {
  severity: "conflict" | "check";
  title: string;
  detail: string;
  bookingIds: string[];
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ findings: [], skipped: "no-api-key" });
  }
  const { bookings, rejected } = (await req.json()) as {
    bookings: { id: string; [k: string]: unknown }[];
    rejected?: string[];
  };
  if (!bookings?.length) return NextResponse.json({ findings: [] });

  const valid = new Set(bookings.map((b) => b.id));
  const anthropic = new Anthropic({ apiKey: key });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `Today is ${new Date().toISOString().slice(0, 10)}.`,
            // Negative examples from the user's own thumbs-down votes. Cheap,
            // and it stops the same unwanted finding coming back every run.
            rejected?.length
              ? `\nThe user marked these earlier findings as NOT useful. Do not report anything of this kind again:\n${rejected
                  .map((t) => `- ${t}`)
                  .join("\n")}`
              : "",
            `\nBookings:\n${JSON.stringify(bookings, null, 1)}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });
    const text = msg.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { findings?: ModelFinding[] };

    // Raw ids leaking into prose reads like a bug — strip them, and drop the
    // finding entirely if that would gut the sentence.
    const idish = /\b[0-9a-f]{8}\b|\b[0-9a-f-]{20,}\b/gi;
    const clean = (s: string) => (s ?? "").replace(idish, "").replace(/\s{2,}/g, " ").trim();

    // Grounding gate: drop anything that doesn't cite real bookings.
    const findings: Finding[] = (parsed.findings ?? [])
      .filter(
        (f) =>
          Array.isArray(f.bookingIds) &&
          f.bookingIds.length > 0 &&
          f.bookingIds.every((id) => valid.has(id)) &&
          clean(f.title).length > 8 &&
          clean(f.detail).length > 20,
      )
      .slice(0, 5) // a wall of AI findings is noise, not insight
      .map((f) => ({ ...f, title: clean(f.title), detail: clean(f.detail) }))
      .map((f) => ({
        id: `ai:${f.bookingIds.slice().sort().join(",")}:${f.title.slice(0, 40)}`,
        severity: f.severity === "conflict" ? "conflict" : "check",
        title: f.title,
        detail: f.detail,
        bookingIds: f.bookingIds,
        source: "ai" as const,
      }));

    return NextResponse.json({ findings });
  } catch {
    return NextResponse.json({ findings: [], skipped: "model-error" });
  }
}
