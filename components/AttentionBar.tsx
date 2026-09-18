"use client";

import { CATEGORY_META, type Booking } from "@/lib/types";
import { countdown, formatMoney, getUrgency } from "@/lib/urgency";

// The United app never lets its one boarding pass scroll out of reach — it
// floats back into view the moment you'd otherwise lose it. LineUp's
// equivalent "reason you're here" is a closing free-cancel window, so this
// pins the single most urgent one to the top of the viewport once you scroll
// past it, wherever you are in the app (not just the Upcoming rail).
//
// The row itself is NOT one big clickable div (that would nest a real <a>
// inside a role="button", which breaks screen-reader/keyboard navigation —
// a control can't contain another control). It's a plain row with two
// independent, full-size (44px+) tap targets sitting side by side instead.
export function AttentionBar({
  bookings,
  onOpen,
}: {
  bookings: Booking[];
  onOpen: (b: Booking) => void;
}) {
  const urgent = bookings
    .filter((b) => b.status === "upcoming" && getUrgency(b) === "urgent")
    .sort(
      (a, b) => new Date(a.cancelBy!).getTime() - new Date(b.cancelBy!).getTime(),
    );

  if (urgent.length === 0) return null;

  const lead = urgent[0];
  const meta = CATEGORY_META[lead.category];
  const price = formatMoney(lead.amount, lead.currency);
  const extra = urgent.length - 1;

  return (
    <div className="sticky top-0 z-20 -mx-5 bg-paper px-5 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] md:mx-0 md:px-0">
      <div className="flex items-stretch overflow-hidden rounded-xl bg-ink shadow-lg shadow-ink/15">
        <button
          onClick={() => onOpen(lead)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-2 text-left"
        >
          <i
            className="ti ti-clock-exclamation shrink-0 text-[19px] text-urgent"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold leading-snug text-paper">
              {countdown(lead.cancelBy!).text} left to cancel {meta.emoji}{" "}
              {lead.title}
              {price && (
                <span className="font-normal text-paper/70"> · {price}</span>
              )}
            </span>
            {extra > 0 && (
              <span className="mt-0.5 block text-[12px] text-paper/60">
                +{extra} more need{extra === 1 ? "s" : ""} a decision
              </span>
            )}
          </span>
        </button>
        {lead.cancelUrl && (
          <a
            href={lead.cancelUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center self-stretch bg-urgent px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Cancel
          </a>
        )}
      </div>
    </div>
  );
}
