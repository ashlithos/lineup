export type Category =
  | "trip"
  | "hotel"
  | "event"
  | "restaurant"
  | "flight"
  | "train"
  | "other";

export type BookingStatus = "upcoming" | "cancelled" | "done" | "plan";

// A line on a trip plan's booked/not-booked checklist.
export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

// Who a plan is with. Multi-select, but "solo" is exclusive.
export const COMPANION_OPTIONS = [
  { value: "solo", label: "Solo", icon: "ti-user" },
  { value: "partner", label: "Partner", icon: "ti-heart" },
  { value: "friends", label: "Friends", icon: "ti-users" },
  { value: "parents", label: "Parents", icon: "ti-users-group" },
] as const;
export type Companion = (typeof COMPANION_OPTIONS)[number]["value"];

export type BookingSource = "manual" | "email" | "paste";

export interface Booking {
  id: string;
  title: string;
  category: Category;
  vendor?: string;
  location?: string;
  eventAt: string; // ISO — when the fun happens (hotel check-in)
  checkOut?: string;
  /** When a flight/train lands. Departure lives in eventAt. */
  arriveAt?: string;
  /**
   * True elapsed minutes for a journey. Stored rather than derived: eventAt
   * and arriveAt are wall-clock times at two different places, so subtracting
   * them is only correct when both ends share a time zone.
   */
  durationMin?: number; // ISO — hotel check-out; drives the nights count
  amount?: number;
  currency: string; // e.g. "GBP", "USD"
  refundable: boolean;
  cancelBy?: string; // ISO — free-cancellation deadline. only meaningful when refundable
  cancelUrl?: string;
  sourceUrl?: string; // deep link to the source email (Gmail permalink)
  notes?: string;
  kept?: boolean; // user acknowledged the deadline — stop swelling into the decision card
  tripName?: string; // custom trip group name (overrides auto-grouping)
  imageUrl?: string; // custom trip photo (overrides the stock one)
  checklist?: ChecklistItem[]; // trip plans: what's booked vs still to book
  companions?: string[]; // who you're going with (solo/partner/friends/parents)
  source?: BookingSource; // how it got in — manual, email scan, or paste
  status: BookingStatus;
  createdAt: string;
  isDemo?: boolean;
}

export const CATEGORY_META: Record<
  Category,
  { label: string; emoji: string; plural: string }
> = {
  trip: { label: "Trip", emoji: "🧳", plural: "Trips" },
  hotel: { label: "Hotel", emoji: "🛏️", plural: "Hotels" },
  event: { label: "Event", emoji: "🎟️", plural: "Events" },
  restaurant: { label: "Dining", emoji: "🍝", plural: "Dining" },
  flight: { label: "Flight", emoji: "✈️", plural: "Flights" },
  train: { label: "Train", emoji: "🚆", plural: "Trains" },
  other: { label: "Other", emoji: "📌", plural: "Other" },
};

// Booking types (used in the Add booking dialog + Upcoming/Past type filter).
// "trip" is plan-only and intentionally excluded here.

// Transport — moves you between places, so it makes a group a real trip.
export const isTransport = (c: Category) => c === "flight" || c === "train";

export const CATEGORY_ORDER: Category[] = [
  "hotel",
  "event",
  "restaurant",
  "flight",
  "train",
  "other",
];

// Plan items use a trip-first set — a plan is usually a whole trip, an event,
// a meal, or something loose. "trip" routes the card into the Trips tier.
export const PLAN_CATEGORY_ORDER: Category[] = [
  "trip",
  "event",
  "restaurant",
  "other",
];
