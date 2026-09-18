"use client";

import { CATEGORY_META, type Booking } from "@/lib/types";
import { countdown, formatMoney, getUrgency } from "@/lib/urgency";

// The United app never lets its one boarding pass scroll out of reach — it
// floats back into view the moment you'd otherwise lose it. LineUp's
// equivalent "reason you're here" is a closing free-cancel window, so this
// pins the single most urgent one to the top of the viewport once you scroll
// past it, wherever you are in the app (not just the Upcoming rail).
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
    <div className="sticky top-0 z-20 pt-[env(safe-area-inset-top)]">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(lead)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(lead);
          }
        }}
        className="mb-5 flex cursor-pointer items-center gap-3 rounded-xl bg-ink px-4 py-3 text-left shadow-lg shadow-ink/15"
      >
        <i
          className="ti ti-clock-exclamation shrink-0 text-[19px] text-urgent"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-snug text-paper">
            {countdown(lead.cancelBy!).text} left to cancel {meta.emoji}{" "}
            {lead.title}
            {price && <span className="font-normal text-paper/70"> · {price}</span>}
          </span>
          {extra > 0 && (
            <span className="mt-0.5 block text-[12px] text-paper/60">
              +{extra} more need{extra === 1 ? "s" : ""} a decision
            </span>
          )}
        </span>
        {lead.cancelUrl && (
          <a
            href={lead.cancelUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded-full bg-urgent px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Cancel
          </a>
        )}
      </div>
    </div>
  );
}
