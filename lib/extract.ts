import type { Booking } from "./types";

export type Draft = Omit<Booking, "id" | "createdAt" | "status">;

export interface Candidate {
  /** A pasted plan arrives as "tobook"; a confirmation as a real booking. */
  draft: Draft & { status?: "upcoming" | "tobook" };
  confidence: "high" | "check" | "partial";
  sourceLabel: string; // which email it came from
  missing: string[]; // field names still worth a glance
}

// Real bookings extracted from the connected inbox (Gmail) on 2026-06-19.
// In production this is the output of the inbox-scan + extraction pipeline;
// here it's the verified result so the review flow is usable end-to-end.
export function scanInbox(): Candidate[] {
  return [
    {
      sourceLabel: "Airbnb confirmation · Magnolia House",
      confidence: "high",
      missing: [],
      draft: {
        title: "Magnolia House, Roseville",
        category: "hotel",
        vendor: "Airbnb",
        location: "Roseville, CA",
        eventAt: "2026-07-03T16:00:00",
        checkOut: "2026-07-04T10:00:00",
        amount: 295.35,
        currency: "USD",
        refundable: true,
        cancelBy: "2026-06-28T16:00:00",
        cancelUrl: "https://www.airbnb.com/reservation/itinerary?code=HM3ZNNTHWQ",
        notes:
          "Reservation HM3ZNNTHWQ · host Jenna Elizabeth · check-out Sat Jul 4, 10 AM",
        source: "email",
      },
    },
    {
      sourceLabel: "Airbnb receipt · Kings Beach",
      confidence: "high",
      missing: [],
      draft: {
        title: "Cozy home near Kings Beach",
        category: "hotel",
        vendor: "Airbnb",
        location: "Kings Beach, CA",
        eventAt: "2026-07-02T16:00:00",
        checkOut: "2026-07-03T10:00:00",
        amount: 410.82,
        currency: "USD",
        refundable: true,
        cancelBy: "2026-06-27T16:00:00",
        cancelUrl: "https://www.airbnb.com/reservation/itinerary?code=HMYXDAWA2M",
        notes:
          "Reservation HMYXDAWA2M · $360 + $50.82 service fee · check-out Jul 3",
        source: "email",
      },
    },
    {
      sourceLabel: "Hilton confirmation #55207690",
      confidence: "high",
      missing: [],
      draft: {
        title: "DoubleTree by Hilton Montreal Downtown",
        category: "hotel",
        vendor: "Hilton",
        location: "Montreal",
        eventAt: "2026-09-22T15:00:00",
        amount: 71.38,
        currency: "CAD",
        refundable: true,
        cancelBy: "2026-09-20T23:59:00",
        notes: "Confirmation #55207690 · 1 king bed · 59.98 CAD + 52,000 points",
        source: "email",
      },
    },
    {
      sourceLabel: "United confirmation NWMYV3",
      confidence: "high",
      missing: [],
      draft: {
        title: "United · San Francisco ⇄ Toronto",
        category: "flight",
        vendor: "United",
        location: "SFO → YYZ",
        eventAt: "2026-09-16T08:10:00",
        amount: 579.78,
        currency: "USD",
        refundable: false,
        notes:
          "Confirmation NWMYV3 · UA608 out Sep 16, UA2462 back Sep 22 · non-refundable",
        source: "email",
      },
    },
    {
      sourceLabel: "Hyatt confirmation 40023B20604376",
      confidence: "check",
      missing: ["amount"],
      draft: {
        title: "Hyatt Regency Toronto",
        category: "hotel",
        vendor: "Hyatt",
        location: "Toronto, ON",
        eventAt: "2026-09-17T16:00:00",
        checkOut: "2026-09-18T11:00:00",
        currency: "CAD",
        refundable: true,
        cancelBy: "2026-09-14T23:59:00",
        notes:
          "Confirmation 40023B20604376 · 1 king, city view · free-night award · only covers Sep 17–18 of the Sep 16–22 Toronto trip",
        source: "email",
      },
    },
    {
      sourceLabel: "StubHub order 644157145",
      confidence: "high",
      missing: [],
      draft: {
        title: "Jason Cheny — comedy show",
        category: "event",
        vendor: "StubHub",
        location: "San Jose Improv",
        eventAt: "2026-12-18T19:30:00",
        amount: 107.3,
        currency: "USD",
        refundable: false,
        notes: "Order 644157145 · general admission · resale, final sale",
        source: "email",
      },
    },
  ];
}

export async function extractFromText(text: string): Promise<Candidate[]> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Extraction failed");
  }
  const data = (await res.json()) as {
    candidates?: Array<
      Candidate["draft"] & {
        confidence?: string;
        missing?: string[];
        needsBooking?: boolean;
      }
    >;
  };
  return (data.candidates ?? []).map((c) => {
    const { confidence, missing, needsBooking, ...draft } = c;
    return {
      draft: {
        ...draft,
        source: "paste",
        // A row from an itinerary that still has to be reserved is not a
        // booking — it lands as "to book" until someone actually books it.
        ...(needsBooking ? { status: "tobook" as const } : {}),
      } as Candidate["draft"],
      confidence: (confidence as Candidate["confidence"]) ?? "check",
      missing: missing ?? [],
      sourceLabel: "Pasted confirmation",
    };
  });
}
