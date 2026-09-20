"use client";

import { useMemo, useState } from "react";
import { outingGroups } from "@/lib/samePlace";
import { isTransport, type Booking } from "@/lib/types";

/**
 * One line when the same outing is on the list more than once, with the fix
 * attached. It asks before deleting, like everywhere else a booking can go.
 */
export function DuplicateBanner({
  bookings,
  onDelete,
}: {
  bookings: Booking[];
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const groups = useMemo(
    () =>
      outingGroups(
        bookings.filter(
          (b) =>
            (b.status === "upcoming" || b.status === "tobook") &&
            !isTransport(b.category),
        ),
      ),
    [bookings],
  );

  const group = groups.find((g) => !dismissed.includes(g[0].id));
  if (!group) return null;

  const keep = group[0];
  const extras = group.length - 1;
  const key = keep.id;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-soon/30 bg-soon-soft px-3.5 py-2.5">
      <span className="min-w-0 flex-1 text-[13px] text-soon">
        <span className="font-medium">{keep.title}</span> is on your list{" "}
        {group.length} times — the same booking, confirmed by more than one
        email.
      </span>
      <button
        onClick={() => {
          if (confirming !== key) {
            setConfirming(key);
            setTimeout(() => setConfirming((c) => (c === key ? null : c)), 5000);
            return;
          }
          setConfirming(null);
          group.slice(1).forEach((b) => onDelete(b.id));
        }}
        className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
          confirming === key
            ? "bg-urgent text-white"
            : "border border-soon/50 bg-raised text-soon hover:bg-soon-soft"
        }`}
      >
        {confirming === key
          ? `Tap again to delete ${extras}`
          : `Keep one, delete ${extras}`}
      </button>
      <button
        onClick={() => setDismissed((d) => [...d, key])}
        aria-label={`Leave the copies of ${keep.title} alone`}
        className="tap grid size-6 shrink-0 place-items-center rounded-md text-soon/70 transition-colors hover:text-soon"
      >
        <i className="ti ti-x text-[14px]" aria-hidden="true" />
      </button>
    </div>
  );
}
