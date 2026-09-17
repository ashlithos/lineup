"use client";

import { CATEGORY_META, isTransport, type Booking } from "@/lib/types";
import {
  countdown,
  getUrgency,
  formatEventDate,
  formatMoney,
  nightsBetween,
} from "@/lib/urgency";
import { RefundBadge } from "./RefundBadge";
import { ticketLabel } from "@/lib/flights";

export function BookingCard({
  booking,
  onOpen,
}: {
  booking: Booking;
  onOpen: (b: Booking) => void;
}) {
  const meta = CATEGORY_META[booking.category];
  const urgency = getUrgency(booking);
  const price = formatMoney(booking.amount, booking.currency);

  // A live cancel window that's closing swaps the calm green badge for an
  // amber/red countdown chip — enough signal without louder card treatment.
  const approaching = urgency === "urgent" || urgency === "soon";

  // Hotels show their length of stay next to the check-in date.
  const nights =
    booking.category === "hotel" && booking.checkOut
      ? nightsBetween(booking.eventAt, booking.checkOut)
      : 0;

  // Lodging & flights scan by brand + place ("Airbnb · Roseville"); the listing
  // name drops to secondary. Events/dining/etc. keep their own name primary.
  const place = [booking.vendor, booking.location].filter(Boolean).join(" · ");
  const placeLed =
    (booking.category === "hotel" || isTransport(booking.category)) && !!place;
  const primary = placeLed ? place : booking.title;
  const secondary = placeLed ? booking.title : place || null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(booking)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(booking);
        }
      }}
      className="group flex h-full w-full cursor-pointer flex-col gap-2.5 rounded-xl border border-line bg-raised px-3.5 py-3 text-left transition-colors hover:border-line-strong focus:outline-none focus-visible:border-accent"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper text-lg">
          {meta.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-semibold leading-snug text-ink">
            {primary}
          </span>
          {secondary && (
            <span className="mt-0.5 block truncate text-[13px] text-ink-soft">
              {secondary}
            </span>
          )}
        </span>
      </div>

      {/* The one number that changes what you do next gets the size, the way
          an airline app gives the hour before boarding the whole card. Loud
          in scale, quiet in colour — the tint stays for genuinely urgent. */}
      {approaching && (
        <p className="pl-12 leading-none">
          <span
            className={`text-[19px] font-semibold tracking-tight ${
              urgency === "urgent" ? "text-urgent" : "text-ink"
            }`}
          >
            {countdown(booking.cancelBy!).text}
          </span>
          <span className="ml-1.5 text-[13px] text-ink-soft">left to cancel</span>
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-12">
        {!approaching && <RefundBadge booking={booking} />}
        <span className="text-[13px] text-ink-soft">
          {formatEventDate(booking.eventAt)}
          {nights > 0 && ` · ${nights} night${nights === 1 ? "" : "s"}`}
        </span>
        {price && (
          <span className="font-mono text-[13px] text-ink-soft">{price}</span>
        )}
        {(booking.sourceUrl || booking.cancelUrl) && (
          <div className="ml-auto flex items-center gap-1.5">
            {booking.sourceUrl && (
              <a
                href={booking.sourceUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
              >
                <i className="ti ti-mail text-[14px]" aria-hidden="true" />
                Email
              </a>
            )}
            {booking.cancelUrl && (
              <a
                href={booking.cancelUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
              >
                <i className="ti ti-external-link text-[14px]" aria-hidden="true" />
                Manage
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// One outing booked across several orders (e.g. seats split between StubHub and
// Ticketmaster to use a credit). One card, a tappable row per order — each still
// opens its own reservation.
export function GroupedBookingCard({
  bookings,
  onOpen,
}: {
  bookings: Booking[];
  onOpen: (b: Booking) => void;
}) {
  const lead = bookings[0];
  const meta = CATEGORY_META[lead.category];
  const allCash = bookings.every((b) => typeof b.amount === "number");
  const total = allCash
    ? formatMoney(
        bookings.reduce((n, b) => n + (b.amount ?? 0), 0),
        lead.currency,
      )
    : null;

  return (
    <div className="flex h-full w-full flex-col gap-2.5 rounded-xl border border-line bg-raised px-3.5 py-3 text-left">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper text-lg">
          {meta.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug text-ink">
            {lead.title}
          </span>
          {lead.location && (
            <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
              {lead.location}
            </span>
          )}
        </span>
        {total && (
          <span className="shrink-0 font-mono text-[16px] font-medium leading-tight text-ink">
            {total}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-12">
        <RefundBadge booking={lead} />
        <span className="text-[12px] text-ink-soft">
          {formatEventDate(lead.eventAt)}
        </span>
        <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-soft">
          {bookings.length} orders
        </span>
      </div>

      <div className="mt-auto flex flex-col divide-y divide-line border-t border-dashed border-line pl-12 pt-1">
        {bookings.map((b) => {
          const { main, detail } = ticketLabel(b);
          const price = formatMoney(b.amount, b.currency);
          return (
            <div key={b.id} className="flex items-center gap-2 py-1.5">
              <button
                onClick={() => onOpen(b)}
                className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <span className="truncate text-[13px] text-ink group-hover:text-accent">
                  {main}
                </span>
                {detail && (
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                    {detail}
                  </span>
                )}
              </button>
              <span className="shrink-0 font-mono text-[12px] text-ink-soft">
                {price || "—"}
              </span>
              {b.sourceUrl && (
                <a
                  href={b.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View source email"
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-paper hover:text-ink"
                >
                  <i className="ti ti-mail text-[14px]" aria-hidden="true" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
