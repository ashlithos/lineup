"use client";

import { useState } from "react";
import type { Booking } from "@/lib/types";
import { cancelDeadlineGcalUrl, tripGcalUrl } from "@/lib/calendar";
import { formatEventDate } from "@/lib/urgency";

// A small calendar icon that opens a menu of "Add to Google Calendar" links.
export function CalendarMenu({ booking }: { booking: Booking }) {
  const [open, setOpen] = useState(false);
  const cancelUrl = cancelDeadlineGcalUrl(booking);
  const tripUrl = tripGcalUrl(booking);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Add to calendar"
        className="grid size-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-paper hover:text-ink"
      >
        <i className="ti ti-calendar-plus text-[17px]" aria-hidden="true" />
      </button>

      {open && (
        <>
          <button
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-xl bg-raised shadow-xl shadow-ink/10">
            <p className="px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              Add to Google Calendar
            </p>
            {cancelUrl && (
              <a
                href={cancelUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-ink hover:bg-paper"
              >
                <i
                  className="ti ti-clock-exclamation shrink-0 text-[17px] text-soon"
                  aria-hidden="true"
                />
                Cancel by {formatEventDate(booking.cancelBy!)}
              </a>
            )}
            <a
              href={tripUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 border-t border-line px-3 py-2.5 text-[13px] text-ink hover:bg-paper"
            >
              <i
                className="ti ti-calendar-event shrink-0 text-[17px] text-ink-soft"
                aria-hidden="true"
              />
              Trip · {formatEventDate(booking.eventAt)}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
