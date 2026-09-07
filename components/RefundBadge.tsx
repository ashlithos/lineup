import type { Booking } from "@/lib/types";
import { formatEventDate } from "@/lib/urgency";

export function RefundBadge({ booking }: { booking: Booking }) {
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
