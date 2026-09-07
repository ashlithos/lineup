import type { Booking } from "./types";

// Clearly-marked DEMO data so the app can be previewed populated.
// Every title is prefixed "DEMO ·" and isDemo is true so the UI can warn.
// Dates are computed relative to now so the urgency states always make sense.
function iso(daysFromNow: number, hour = 18): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function sampleBookings(): Booking[] {
  const now = new Date().toISOString();
  const mk = (
    b: Omit<Booking, "id" | "createdAt" | "status" | "currency" | "isDemo"> &
      Partial<Pick<Booking, "currency">>,
  ): Booking => ({
    ...b,
    id: "demo-" + Math.random().toString(36).slice(2),
    currency: b.currency ?? "GBP",
    status: "upcoming",
    createdAt: now,
    isDemo: true,
  });

  return [
    mk({
      title: "DEMO · Hôtel Lumière, Lisbon",
      category: "hotel",
      vendor: "Booking.com",
      location: "Lisbon",
      eventAt: iso(16),
      checkOut: iso(19, 10), // 3 nights
      amount: 240,
      refundable: true,
      cancelBy: iso(1, 18), // ~1 day → urgent
      cancelUrl: "https://www.booking.com",
    }),
    mk({
      title: "DEMO · Casa Verde guesthouse",
      category: "hotel",
      vendor: "Airbnb",
      location: "Sintra",
      eventAt: iso(22),
      checkOut: iso(24, 10), // 2 nights
      amount: 180,
      refundable: true,
      cancelBy: iso(5, 12), // ~5 days → soon
    }),
    mk({
      title: "DEMO · Lake cabin weekend",
      category: "hotel",
      vendor: "Hipcamp",
      eventAt: iso(48),
      checkOut: iso(50, 10), // 2 nights
      amount: 320,
      refundable: true,
      cancelBy: iso(40, 12), // far off → calm
    }),
    mk({
      title: "DEMO · The Hive escape room",
      category: "event",
      vendor: "The Hive",
      eventAt: iso(6),
      amount: 48,
      refundable: true,
      cancelBy: iso(4, 18), // ~4 days → soon
    }),
    mk({
      title: "DEMO · Khruangbin live",
      category: "event",
      vendor: "DICE",
      location: "Brixton",
      eventAt: iso(21),
      amount: 65,
      refundable: false, // locked in → pure anticipation
    }),
    mk({
      title: "DEMO · Tasting menu at Oseille",
      category: "restaurant",
      vendor: "Resy",
      eventAt: iso(9),
      amount: 90,
      refundable: false, // locked in
    }),
  ];
}
