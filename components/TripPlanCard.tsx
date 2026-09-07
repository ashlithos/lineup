"use client";

import { COMPANION_OPTIONS, type Booking } from "@/lib/types";
import { localDate } from "@/lib/localtime";

// A trip you want to take but haven't fully booked — the hero tier of the Plan
// tab. Shows a booked/not-booked progress bar from its checklist.
export function TripPlanCard({
  plan,
  onOpen,
}: {
  plan: Booking;
  onOpen: (b: Booking) => void;
}) {
  const roughTiming =
    plan.eventAt && !plan.eventAt.startsWith("9999")
      ? localDate(plan.eventAt).toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : null;

  const items = plan.checklist ?? [];
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;

  const withWhom = (plan.companions ?? [])
    .map((v) => COMPANION_OPTIONS.find((o) => o.value === v)?.label)
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      onClick={() => onOpen(plan)}
      className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-raised text-left transition-colors hover:border-accent"
    >
      {plan.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={plan.imageUrl}
          alt=""
          className="h-24 w-full shrink-0 object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-3 px-4 py-3.5">
      <div className="flex items-start gap-2">
        <i
          className="ti ti-map-pin mt-1 shrink-0 text-[16px] text-accent"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 font-serif text-lg leading-tight text-ink">
          {plan.title}
        </span>
      </div>

      <div className="mt-auto space-y-2.5">
        {total > 0 ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] font-medium text-ink-soft">
                {done} of {total} booked
              </span>
              {allDone && (
                <span className="text-[11px] font-medium text-ok">All set</span>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full transition-all ${
                  allDone ? "bg-ok" : "bg-accent"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="block text-[12px] text-ink-faint">
            Nothing booked yet · tap to plan
          </span>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {roughTiming ? (
            <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-medium text-ink-soft">
              {roughTiming}
            </span>
          ) : (
            <span className="text-[12px] text-ink-faint">No date yet</span>
          )}
          {withWhom && (
            <span className="inline-flex items-center gap-1 text-[12px] text-ink-faint">
              <i className="ti ti-users text-[13px]" aria-hidden="true" />
              {withWhom}
            </span>
          )}
        </div>
      </div>
      </div>
    </button>
  );
}
