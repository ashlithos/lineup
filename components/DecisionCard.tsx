"use client";

import { CATEGORY_META, type Booking } from "@/lib/types";
import {
  countdown,
  formatDeadline,
  formatMoney,
} from "@/lib/urgency";
import { CalendarMenu } from "./CalendarMenu";

export function DecisionCard({
  booking,
  onKeep,
  onCancel,
}: {
  booking: Booking;
  onKeep: (b: Booking) => void;
  onCancel: (b: Booking) => void;
}) {
  const meta = CATEGORY_META[booking.category];
  const c = booking.cancelBy ? countdown(booking.cancelBy) : null;
  const money = formatMoney(booking.amount, booking.currency);

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-accent-strong">
          <span className="size-1.5 rounded-full bg-accent" />
          Decide soon
        </div>
        <CalendarMenu booking={booking} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xl">{meta.emoji}</span>
        <h2 className="text-2xl font-semibold leading-tight text-ink">
          {booking.title}
        </h2>
      </div>

      <p className="mt-4 font-mono text-3xl font-medium leading-tight text-accent-strong">
        {c?.past ? "Window closed" : `${c?.text} left`}
      </p>
      <p className="mt-2 text-sm text-accent-strong/90">
        to cancel for free
        {booking.cancelBy && ` · by ${formatDeadline(booking.cancelBy)}`}
        {money && ` · ${money} back`}
      </p>

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={() => onKeep(booking)}
          className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white transition-all hover:opacity-95 active:scale-[0.97]"
        >
          Keep it
        </button>
        <button
          onClick={() => onCancel(booking)}
          className="flex-1 rounded-xl border border-urgent/40 bg-raised px-4 py-3 text-sm font-medium text-urgent transition-all hover:bg-urgent-soft active:scale-[0.97]"
        >
          Cancel it
        </button>
      </div>
    </div>
  );
}
