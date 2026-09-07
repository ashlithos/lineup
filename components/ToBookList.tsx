"use client";

import type { Booking } from "@/lib/types";
import { localDate, localMins } from "@/lib/localtime";
import { hhmm } from "@/lib/freetime";

// The other half of "researched but not booked": a checklist of what still has
// to be reserved, grouped by day, so it can be handed to someone.

const dayLabel = (iso: string) =>
  localDate(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function ToBookList({
  bookings,
  onOpen,
  onBooked,
}: {
  bookings: Booking[];
  onOpen: (b: Booking) => void;
  onBooked: (b: Booking) => void;
}) {
  const items = bookings
    .filter((b) => b.status === "tobook")
    .sort((a, b) => a.eventAt.localeCompare(b.eventAt));
  if (!items.length) return null;

  // Group by day so a researched day reads as one block of work.
  const byDay = new Map<string, Booking[]>();
  for (const b of items) {
    const k = b.eventAt.slice(0, 10);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(b);
  }

  return (
    <section className="rounded-xl border border-dashed border-accent/50 bg-accent-soft/30 p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-semibold text-ink">Still to book</h3>
        <span className="rounded-full border border-dashed border-accent px-2 py-0.5 text-[11px] font-medium text-accent">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="space-y-3">
        {[...byDay.entries()].map(([day, list]) => (
          <div key={day}>
            <p className="mb-1 text-[12px] font-medium text-ink-soft">
              {dayLabel(list[0].eventAt)}
            </p>
            <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
              {list.map((b) => (
                <li key={b.id} className="flex items-start gap-2.5 px-3 py-2.5">
                  <button
                    onClick={() => onBooked(b)}
                    aria-label={`Mark "${b.title}" as booked`}
                    title="Mark as booked"
                    className="mt-0.5 size-[18px] shrink-0 rounded border-[1.5px] border-line-strong transition-colors hover:border-ok hover:bg-ok-soft"
                  />
                  <button
                    onClick={() => onOpen(b)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block text-[13.5px] font-medium leading-snug text-ink">
                      {b.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-faint">
                      <span className="font-mono">{hhmm(localMins(b.eventAt))}</span>
                      {b.location && <span className="truncate">{b.location}</span>}
                      {b.assignee && (
                        <span className="rounded-full border border-line bg-paper px-2 py-0.5 font-medium text-ink-soft">
                          {b.assignee}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-[11px] text-ink-faint">
        Nothing here is reserved. Tick one once it&apos;s actually booked.
      </p>
    </section>
  );
}
