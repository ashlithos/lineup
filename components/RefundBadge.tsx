import type { Booking } from "@/lib/types";
import { formatEventDate } from "@/lib/urgency";

export function RefundBadge({ booking }: { booking: Booking }) {
  // Refundability is a fact about a reservation. Nothing here is reserved yet,
  // so "non-refundable" reads as a warning about money that hasn't been spent.
  if (booking.status === "tobook") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-accent px-2 py-0.5 text-[11px] font-medium text-accent">
        To book
      </span>
    );
  }
  if (booking.status === "plan") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2 py-0.5 text-[11px] font-medium text-ink-soft">
        Planned
      </span>
    );
  }
  if (!booking.refundable) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-locked-soft px-2 py-0.5 text-[11px] font-medium text-locked">
        Non-refundable
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok">
      {booking.cancelBy
        ? `Free cancel until ${formatEventDate(booking.cancelBy)}`
        : "Free cancellation"}
    </span>
  );
}
