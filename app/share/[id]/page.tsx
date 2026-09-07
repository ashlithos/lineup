import type { Metadata } from "next";
import Link from "next/link";
import { getSupabase, rowToBooking, TABLE, type BookingRow } from "@/lib/supabase";
import { CATEGORY_META, isTransport, type Booking } from "@/lib/types";
import { tripDays } from "@/lib/agenda";
import { collapseFlights, collapseStays, isFlightGroup } from "@/lib/flights";
import { nightsBetween } from "@/lib/urgency";
import { localDate } from "@/lib/localtime";
import { ShareTimetable } from "@/components/ShareTimetable";

export const dynamic = "force-dynamic";

const SHARER_NAME = "Ashley";

// Where a recipient goes to look up an item — a plain Google search so they can
// find the hotel or the same flight to book their own (never the owner's
// private reservation link).
function lookupUrl(b: Booking): string {
  const clean = b.title.replace(/[·→]/g, " ").replace(/\s+/g, " ").trim();
  const q = isTransport(b.category) ? `${clean} ${b.category}` : clean;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// Resolve a booked trip from any one of its booking ids, regrouping by trip name.
async function getSharedTrip(
  id: string,
): Promise<{ name: string; bookings: Booking[] } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const seed = rowToBooking(data as BookingRow);
  if (seed.status !== "upcoming") return null; // only real, booked trips

  let bookings = [seed];
  if (seed.tripName) {
    const { data: group } = await supabase
      .from(TABLE)
      .select("*")
      .eq("trip_name", seed.tripName)
      .eq("status", "upcoming");
    if (group?.length) bookings = (group as BookingRow[]).map(rowToBooking);
  }
  bookings.sort((a, b) => +new Date(a.eventAt) - +new Date(b.eventAt));
  return { name: seed.tripName || seed.title, bookings };
}

// The cities a trip actually visits, in order, for the link preview.
function tripCities(bookings: Booking[]): string[] {
  const out: string[] = [];
  for (const b of [...bookings].sort((a, c) => a.eventAt.localeCompare(c.eventAt))) {
    if (b.category !== "hotel") continue;
    const city = (b.location ?? "").split(",")[0].trim();
    if (city && out[out.length - 1] !== city) out.push(city);
  }
  return out;
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  localDate(iso).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

function rangeLabel(bookings: Booking[]): string {
  const stamps = bookings
    .flatMap((b) => [b.eventAt, b.checkOut])
    .filter(Boolean)
    .map((d) => +new Date(d as string));
  const start = new Date(Math.min(...stamps)).toISOString();
  const end = new Date(Math.max(...stamps)).toISOString();
  const sameYear = fmt(start, { year: "numeric" }) === fmt(end, { year: "numeric" });
  const left = fmt(start, { month: "short", day: "numeric" });
  const right = fmt(end, { month: "short", day: "numeric", year: "numeric" });
  return sameYear ? `${left} – ${right}` : `${fmt(start, { month: "short", day: "numeric", year: "numeric" })} – ${right}`;
}

const dow = (iso: string) =>
  fmt(iso, { weekday: "short", month: "short", day: "numeric" });

function secondary(b: Booking): string | null {
  if (b.category === "hotel") {
    const n = b.checkOut ? nightsBetween(b.eventAt, b.checkOut) : 0;
    if (b.checkOut && n > 1) {
      const ci = localDate(b.eventAt);
      const co = localDate(b.checkOut);
      const mon = (d: Date) => fmt(d.toISOString(), { month: "short" });
      const range =
        ci.getUTCMonth() === co.getUTCMonth()
          ? `${mon(ci)} ${ci.getUTCDate()} → ${co.getUTCDate()}`
          : `${mon(ci)} ${ci.getUTCDate()} → ${mon(co)} ${co.getUTCDate()}`;
      return `${range} · ${n} nights`;
    }
    const nights = n > 0 ? `${n} night${n === 1 ? "" : "s"} · ` : "";
    return `${nights}${fmt(b.eventAt, { month: "short", day: "numeric" })}`;
  }
  // Flights lead with the whole journey — out and back — when we know the return.
  if (isTransport(b.category)) {
    return b.checkOut ? `Out ${dow(b.eventAt)} · Back ${dow(b.checkOut)}` : dow(b.eventAt);
  }
  return dow(b.eventAt);
}

// Nights away = the span of the whole trip, not the sum of stays — a hotel
// with no check-out date on file would otherwise silently undercount.
function totalNights(bookings: Booking[]): number {
  const stamps = bookings
    .flatMap((b) => [b.eventAt, b.checkOut])
    .filter((d): d is string => !!d)
    .map((d) => +new Date(d));
  if (!stamps.length) return 0;
  return nightsBetween(
    new Date(Math.min(...stamps)).toISOString(),
    new Date(Math.max(...stamps)).toISOString(),
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { view } = await searchParams;
  const trip = await getSharedTrip(id);
  if (!trip) {
    return { title: "Trip plan" };
  }
  const timetable = view === "timetable";
  const cities = tripCities(trip.bookings);
  const nights = totalNights(trip.bookings);
  const title = timetable
    ? `${trip.name} — when ${SHARER_NAME} is free`
    : `${SHARER_NAME} shared ${trip.name} with you`;
  const description = [
    rangeLabel(trip.bookings),
    nights > 0 && !timetable ? `${nights} nights` : null,
    cities.length ? cities.slice(0, 4).join(" · ") : null,
    timetable ? "Open time each day" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const cover = trip.bookings.find((b) => b.imageUrl?.trim())?.imageUrl;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "LineUp",
      ...(cover ? { images: [{ url: cover, alt: trip.name }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const timetable = view === "timetable";
  const trip = await getSharedTrip(id);

  if (!trip) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6">
        <div className="text-center">
          <h1 className="font-serif text-2xl text-ink">Nothing to see here</h1>
          <p className="mt-2 text-[14px] text-ink-soft">
            This trip isn&apos;t shared, or the link has expired.
          </p>
        </div>
      </main>
    );
  }

  const { name, bookings } = trip;
  const gaps = tripDays(bookings).filter((d) => d.gap);
  const cover = bookings.find((b) => b.imageUrl && b.imageUrl.trim())?.imageUrl;
  const nights = totalNights(bookings);
  // Chain multi-reservation stays first, then merge duplicate flights/tickets.
  const stays = collapseStays(bookings);
  const items = collapseFlights(
    stays.filter((x): x is Booking => !isFlightGroup(x)),
  ).concat(stays.filter(isFlightGroup));
  items.sort((a, b) => {
    const av = isFlightGroup(a) ? a.lead.eventAt : a.eventAt;
    const bv = isFlightGroup(b) ? b.lead.eventAt : b.eventAt;
    return av.localeCompare(bv);
  });
  const rangeText = rangeLabel(bookings);

  return (
    <main className="min-h-screen bg-paper px-5 py-12">
      <div className={`mx-auto ${timetable ? "max-w-5xl" : "max-w-md"}`}>
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-medium text-white">
            {SHARER_NAME.charAt(0)}
          </span>
          <span className="text-[14px] text-ink-soft">
            {SHARER_NAME} shared a trip plan with you
          </span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-raised">
          {cover ? (
            <div
              className="relative h-44 w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${cover})` }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <h1 className="font-serif text-[27px] leading-tight drop-shadow-sm">
                  {name}
                </h1>
                <p className="mt-0.5 text-[13px] text-white/90">
                  {rangeText}
                  {timetable ? " · when I'm free" : nights > 0 ? ` · ${nights} nights` : ""}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 px-6 pt-6">
              <i
                className="ti ti-map-pin mt-1.5 shrink-0 text-[20px] text-accent"
                aria-hidden="true"
              />
              <div>
                <h1 className="font-serif text-[26px] leading-tight text-ink">
                  {name}
                </h1>
                <p className="mt-1 text-[14px] text-ink-soft">
                  {rangeText}
                  {nights > 0 && ` · ${nights} nights`}
                </p>
              </div>
            </div>
          )}

          <div className="p-6 pt-5">
          {timetable ? (
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-accent">
                Open time each day
              </h2>
              <ShareTimetable bookings={bookings} />
            </section>
          ) : (
          <section>
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-ok">
              Booked
            </h2>
            <ul className="-mx-2 space-y-1">
              {items.map((it) => {
                const b = isFlightGroup(it) ? it.lead : it;
                return (
                <li key={b.id}>
                  <a
                    href={lookupUrl(b)}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-paper"
                  >
                    <span className="text-[16px] leading-5">
                      {CATEGORY_META[b.category].emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-snug text-ink group-hover:text-accent">
                        {b.title}
                      </span>
                      {secondary(b) && (
                        <span className="block text-[12px] text-ink-faint">
                          {secondary(b)}
                        </span>
                      )}
                    </span>
                    <i
                      className="ti ti-external-link mt-1 shrink-0 text-[14px] text-ink-faint transition-colors group-hover:text-accent"
                      aria-hidden="true"
                    />
                  </a>
                </li>
                );
              })}
            </ul>
          </section>
          )}

          {!timetable && gaps.length > 0 && (
            <section className="mt-5 border-t border-line pt-5">
              <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Still to sort
              </h2>
              <ul className="space-y-2">
                {gaps.map((g) => (
                  <li key={g.key} className="flex items-center gap-2.5">
                    <i
                      className="ti ti-bed text-[18px] text-soon"
                      aria-hidden="true"
                    />
                    <span className="text-[14px] text-ink-soft">
                      No stay booked ·{" "}
                      {fmt(g.date, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          </div>
        </div>

        <Link
          href="/"
          className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-ink-faint transition-colors hover:text-ink"
        >
          Planned with LineUp
          <i className="ti ti-arrow-right text-[14px]" aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
