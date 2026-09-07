"use client";

import { CATEGORY_META, type Booking } from "@/lib/types";
import { formatMoney } from "@/lib/urgency";
import { localDate } from "@/lib/localtime";

// A want-to-book item: lighter than a booking, with a "booked it" promote action.
export function PlanCard({
  plan,
  onOpen,
  onBooked,
}: {
  plan: Booking;
  onOpen: (b: Booking) => void;
  onBooked: (b: Booking) => void;
}) {
  const meta = CATEGORY_META[plan.category];
  const price = formatMoney(plan.amount, plan.currency);
  const roughTiming =
    plan.eventAt && !plan.eventAt.startsWith("9999")
      ? localDate(plan.eventAt).toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(plan)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(plan);
        }
      }}
      className="group flex h-full w-full cursor-pointer flex-col gap-2.5 rounded-xl border border-dashed border-line-strong bg-raised px-3.5 py-3 text-left transition-colors hover:border-accent focus:outline-none focus-visible:border-accent"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper text-lg">
          {meta.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug text-ink">
            {plan.title}
          </span>
          {plan.notes && (
            <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
              {plan.notes}
            </span>
          )}
        </span>
        {price && (
          <span className="shrink-0 text-[13px] text-ink-soft">~{price}</span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 pl-12">
        <span className="text-[12px] text-ink-faint">{meta.label}</span>
        {roughTiming && (
          <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-medium text-ink-soft">
            {roughTiming}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {plan.cancelUrl && (
            <a
              href={plan.cancelUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Open booking page"
              className="grid size-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-paper hover:text-ink"
            >
              <i className="ti ti-external-link text-[16px]" aria-hidden="true" />
            </a>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBooked(plan);
            }}
            className="rounded-lg border border-line-strong px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-paper"
          >
            Booked it
          </button>
        </div>
      </div>
    </div>
  );
}
