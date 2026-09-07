"use client";

import { CATEGORY_META, isTransport, type Booking } from "@/lib/types";
import { buildTimeline, type Chapter } from "@/lib/chapters";
import { collapseFlights, isFlightGroup, ticketLabel, type FlightGroup } from "@/lib/flights";
import { countdown, formatMoney, getUrgency } from "@/lib/urgency";
import { legTimes } from "@/lib/freetime";
import { localDate } from "@/lib/localtime";

const dow = (iso: string) =>
  localDate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// "Sep 17 → 20 · 3 nights" for a stay whose span we know.
function stayRange(checkIn: string, checkOut?: string, nights?: number): string {
  if (!checkOut) return "Length unknown";
  const ci = localDate(checkIn);
  const co = localDate(checkOut);
  const mon = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  const n = nights ?? 1;
  const range =
    ci.getUTCMonth() === co.getUTCMonth()
      ? `${mon(ci)} ${ci.getUTCDate()} → ${co.getUTCDate()}`
      : `${mon(ci)} ${ci.getUTCDate()} → ${mon(co)} ${co.getUTCDate()}`;
  return `${range} · ${n} night${n === 1 ? "" : "s"}`;
}

// A flight's out-and-back line, when we know the return (stored on checkOut).
function flightWhen(b: Booking): string {
  return b.checkOut ? `Out ${dow(b.eventAt)} · Back ${dow(b.checkOut)}` : dow(b.eventAt);
}

// Departure → landing with the duration between, for transport that has both.
function RouteStrip({ booking }: { booking: Booking }) {
  const { dep, arr, length } = legTimes(booking);
  const [from, to] = (booking.location ?? "").split(/[→⇄]/).map((x) => x.trim());
  if (!arr) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-soon-soft px-2 py-0.5 text-[11px] font-medium text-soon">
        <i className="ti ti-clock-question text-[13px]" aria-hidden="true" />
        Landing time not on file
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2.5">
      <span className="text-center">
        <span className="block font-mono text-[13px] font-semibold text-ink">{dep}</span>
        {from && <span className="block text-[10px] text-ink-faint">{from}</span>}
      </span>
      <span className="relative flex-1">
        <span className="block h-px bg-line-strong" aria-hidden="true" />
        {length && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-raised px-1.5 font-mono text-[10px] text-ink-soft">
            {length}
          </span>
        )}
      </span>
      <span className="text-center">
        <span className="block font-mono text-[13px] font-semibold text-ink">{arr}</span>
        {to && <span className="block text-[10px] text-ink-faint">{to}</span>}
      </span>
    </span>
  );
}

function Row({
  booking,
  detail,
  onOpen,
}: {
  booking: Booking;
  detail?: string;
  onOpen: (b: Booking) => void;
}) {
  const meta = CATEGORY_META[booking.category];
  const urgency = getUrgency(booking);
  const approaching = urgency === "urgent" || urgency === "soon";
  const price = formatMoney(booking.amount, booking.currency);
  const place = [booking.vendor, booking.location].filter(Boolean).join(" · ");
  const placeLed =
    (booking.category === "hotel" || isTransport(booking.category)) && !!place;
  const primary = placeLed ? place : booking.title;
  const secondary =
    detail ??
    (isTransport(booking.category)
      ? flightWhen(booking)
      : placeLed
        ? booking.title
        : null);

  const showCancel = approaching && !!booking.cancelBy;

  return (
    <button
      onClick={() => onOpen(booking)}
      className="group flex w-full flex-col gap-1.5 rounded-xl border border-line bg-raised px-3.5 py-3 text-left transition-colors hover:border-line-strong"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper text-lg">
          {meta.emoji}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
          {primary}
        </span>
        {price && (
          <span className="shrink-0 font-mono text-[14px] font-medium text-ink">
            {price}
          </span>
        )}
      </div>
      {(secondary || showCancel) && (
        <div className="flex flex-wrap items-center gap-2 pl-12">
          {secondary && (
            <span className="truncate text-[13px] text-ink-faint">
              {secondary}
            </span>
          )}
          {showCancel && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                urgency === "urgent"
                  ? "bg-urgent-soft text-urgent"
                  : "bg-soon-soft text-soon"
              }`}
            >
              {countdown(booking.cancelBy!).text} left
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// One real thing (a flight, a show, a stay) booked across several reservations
// — split for points, awards or vendor credit. A single card, one tappable row
// per reservation: each still opens its own booking. Nothing is merged in the
// data, only in the view.
function GroupCard({
  emoji,
  title,
  when,
  countLabel,
  total,
  reservations,
  onOpen,
}: {
  emoji: string;
  title: string;
  when: string;
  countLabel: string;
  total?: string | null;
  reservations: Booking[];
  onOpen: (b: Booking) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-raised px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper text-lg">
          {emoji}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
          {title}
        </span>
        {total ? (
          <span className="shrink-0 font-mono text-[14px] font-medium text-ink">
            {total}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-soft">
            {countLabel}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-12 text-[13px] text-ink-faint">
        <span>{when}</span>
        {total && (
          <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-soft">
            {countLabel}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex flex-col divide-y divide-line border-t border-dashed border-line pl-12 pt-1">
        {reservations.map((t) => {
          const { main, detail } = ticketLabel(t);
          const price = formatMoney(t.amount, t.currency);
          return (
            <button
              key={t.id}
              onClick={() => onOpen(t)}
              className="group flex items-center gap-2 py-1.5 text-left transition-colors"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {main}
                {detail && (
                  <span className="ml-1.5 font-mono text-[11px] text-ink-faint">
                    {detail}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[12px] text-ink-soft">
                {price || "points"}
              </span>
              <i className="ti ti-chevron-right text-[14px] text-ink-faint group-hover:text-ink-soft" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Sum a group's reservations when every one has a cash amount — a stay paid
// with awards has nothing to total, so the count pill leads instead.
function groupTotal(bs: Booking[]): string | null {
  if (!bs.every((b) => typeof b.amount === "number")) return null;
  const sum = bs.reduce((n, b) => n + (b.amount ?? 0), 0);
  return sum > 0 ? formatMoney(sum, bs[0].currency) : null;
}

// One stay inside a chapter — a single card, or a group when the nights were
// booked as several reservations.
function StayBlock({
  item,
  chapter,
  onOpen,
}: {
  item: Booking | FlightGroup;
  chapter: Chapter;
  onOpen: (b: Booking) => void;
}) {
  if (isFlightGroup(item)) {
    return (
      <GroupCard
        emoji="🛏️"
        title={item.lead.vendor ?? item.lead.title}
        when={stayRange(item.lead.eventAt, item.lead.checkOut, chapter.nights)}
        countLabel={`${item.tickets.length} reservations`}
        total={groupTotal(item.tickets)}
        reservations={item.tickets}
        onOpen={onOpen}
      />
    );
  }
  const nights =
    item.checkOut
      ? Math.max(
          1,
          Math.round(
            (Date.parse(item.checkOut.slice(0, 10)) -
              Date.parse(item.eventAt.slice(0, 10))) /
              86_400_000,
          ),
        )
      : undefined;
  return (
    <Row
      booking={item}
      detail={stayRange(item.eventAt, item.checkOut, nights)}
      onOpen={onOpen}
    />
  );
}

export function TripAgenda({
  bookings,
  onOpen,
  onAddStay,
}: {
  bookings: Booking[];
  onOpen: (b: Booking) => void;
  onAddStay: (dateISO: string) => void;
}) {
  const timeline = buildTimeline(bookings);

  return (
    <div className="space-y-2">
      {timeline.map((item) => {
        // A journey between cities — deliberately lighter than a chapter, so
        // the eye reads it as movement rather than a place.
        if (item.kind === "leg") {
          const b = item.booking;
          const isMove = isTransport(b.category);
          // Several tickets on one journey: keep the full group card so each
          // traveller's reservation is still reachable.
          if (item.group) {
            return (
              <div key={item.key} className="ml-5 border-l-2 border-dashed border-line-strong pl-4">
                <GroupCard
                  emoji={CATEGORY_META[b.category].emoji}
                  title={[b.vendor, b.location].filter(Boolean).join(" · ") || b.title}
                  when={flightWhen(b)}
                  countLabel={`${item.group.tickets.length} tickets`}
                  total={groupTotal(item.group.tickets)}
                  reservations={item.group.tickets}
                  onOpen={onOpen}
                />
              </div>
            );
          }
          return (
            <button
              key={item.key}
              onClick={() => onOpen(b)}
              className="ml-5 flex w-[calc(100%-1.25rem)] items-center gap-3 border-l-2 border-dashed border-line-strong py-2 pl-4 text-left transition-colors hover:border-accent"
            >
              <span className="text-[16px]">
                {CATEGORY_META[b.category].emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-ink-soft">
                  {isMove ? b.title : `${b.title}${b.location ? ` · ${b.location}` : ""}`}
                </span>
                {isMove && (
                  <span className="mt-1 block max-w-[300px]">
                    <RouteStrip booking={b} />
                  </span>
                )}
              </span>
              <span className="shrink-0 self-start font-mono text-[11.5px] text-ink-faint">
                {dow(b.eventAt)}
              </span>
            </button>
          );
        }

        if (item.kind === "gap") {
          return (
            <button
              key={item.key}
              onClick={() => onAddStay(item.start)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-soon/50 bg-soon-soft px-3.5 py-3 text-left transition-colors hover:border-soon"
            >
              <i className="ti ti-bed text-[18px] text-soon" aria-hidden="true" />
              <span className="flex-1 text-[14px] font-medium text-soon">
                No stay booked · {item.nights} night{item.nights === 1 ? "" : "s"}
              </span>
              <span className="text-[13px] font-medium text-soon underline">
                Add a hotel
              </span>
            </button>
          );
        }

        // A city chapter: where you are, for how long, and what's on there.
        return (
          <section
            key={item.key}
            className="overflow-hidden rounded-xl border border-line bg-raised"
          >
            {/* Neutral header with a single accent tick — the colour marks the
                place without flooding the card. */}
            <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-line bg-paper px-3.5 py-2.5">
              <span
                className="mr-0.5 h-3.5 w-1 shrink-0 self-center rounded-full bg-accent"
                aria-hidden="true"
              />
              <h3 className="text-[15px] font-semibold text-ink">{item.city}</h3>
              <span className="font-mono text-[12px] text-ink-soft">
                {stayRange(item.start, item.end, item.nights)}
              </span>
            </header>
            <div className="space-y-2 p-2.5">
              {item.stays.map((s, i) => (
                <StayBlock
                  key={isFlightGroup(s) ? s.key : s.id + i}
                  item={s}
                  chapter={item}
                  onOpen={onOpen}
                />
              ))}
              {collapseFlights(item.events).map((e) =>
                isFlightGroup(e) ? (
                  <GroupCard
                    key={e.key}
                    emoji={CATEGORY_META[e.lead.category].emoji}
                    title={e.lead.title}
                    when={[e.lead.location, dow(e.lead.eventAt)]
                      .filter(Boolean)
                      .join(" · ")}
                    countLabel={`${e.tickets.length} orders`}
                    total={groupTotal(e.tickets)}
                    reservations={e.tickets}
                    onOpen={onOpen}
                  />
                ) : (
                  <Row
                    key={e.id}
                    booking={e}
                    detail={dow(e.eventAt)}
                    onOpen={onOpen}
                  />
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
