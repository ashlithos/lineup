"use client";

import { useEffect, useState } from "react";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  type Booking,
  type Category,
} from "@/lib/types";
import { nightsBetween, formatEventDate } from "@/lib/urgency";
import { cancelDeadlineGcalUrl, tripGcalUrl } from "@/lib/calendar";

type Draft = Omit<Booking, "id" | "createdAt" | "status">;

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(val: string): string | undefined {
  if (!val) return undefined;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

const CURRENCIES = ["USD", "CAD", "EUR", "GBP"];

export function AddBookingDialog({
  open,
  booking,
  onClose,
  onSave,
  onDelete,
  onMarkCancelled,
  prefill,
}: {
  open: boolean;
  booking: Booking | null;
  prefill?: Partial<Booking> | null;
  onClose: () => void;
  onSave: (draft: Draft, id: string | null) => void;
  onDelete: (id: string) => void;
  onMarkCancelled: (id: string) => void;
}) {
  const editing = !!booking;
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("hotel");
  const [vendor, setVendor] = useState("");
  const [location, setLocation] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [refundable, setRefundable] = useState(true);
  const [cancelBy, setCancelBy] = useState("");
  const [cancelUrl, setCancelUrl] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(booking?.title ?? "");
    setCategory(booking?.category ?? prefill?.category ?? "hotel");
    setVendor(booking?.vendor ?? "");
    setLocation(booking?.location ?? prefill?.location ?? "");
    setEventAt(toLocalInput(booking?.eventAt ?? prefill?.eventAt));
    setCheckOut(toLocalInput(booking?.checkOut));
    setAmount(booking?.amount != null ? String(booking.amount) : "");
    setCurrency(booking?.currency ?? "USD");
    setRefundable(booking?.refundable ?? true);
    setCancelBy(toLocalInput(booking?.cancelBy));
    setCancelUrl(booking?.cancelUrl ?? "");
    setNotes(booking?.notes ?? "");
  }, [open, booking, prefill]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canSave = title.trim() !== "" && eventAt !== "";

  const isHotel = category === "hotel";
  const ci = fromLocalInput(eventAt);
  const co = fromLocalInput(checkOut);
  const stayNights = isHotel && ci && co ? nightsBetween(ci, co) : 0;

  // Calendar links live here (the detail view), not on the card. Built from the
  // saved booking, so save edits first if you changed the dates.
  const cancelGcal = booking ? cancelDeadlineGcalUrl(booking) : null;
  const tripGcal = booking ? tripGcalUrl(booking) : null;

  const handleSave = () => {
    if (!canSave) return;
    onSave(
      {
        title: title.trim(),
        category,
        vendor: vendor.trim() || undefined,
        location: location.trim() || undefined,
        eventAt: fromLocalInput(eventAt)!,
        checkOut: category === "hotel" ? fromLocalInput(checkOut) : undefined,
        amount: amount.trim() ? Number(amount) : undefined,
        currency,
        refundable,
        cancelBy: refundable ? fromLocalInput(cancelBy) : undefined,
        cancelUrl: cancelUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        kept: booking?.kept,
      },
      booking?.id ?? null,
    );
  };

  const field =
    "w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent";
  const label = "block text-[13px] font-medium text-ink-soft mb-1.5";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-raised p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-ink">
            {editing ? "Edit booking" : "Add a booking"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full text-ink-faint hover:bg-paper"
          >
            <i className="ti ti-x text-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className={label}>What is it?</label>
            <input
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hôtel Lumière, Lisbon"
              autoFocus
            />
          </div>

          <div>
            <label className={label}>Type</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_ORDER.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                    category === c
                      ? "border-ink bg-ink text-paper"
                      : "border-line bg-paper text-ink-soft hover:border-line-strong"
                  }`}
                >
                  {CATEGORY_META[c].emoji} {CATEGORY_META[c].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>{isHotel ? "Check-in" : "When"}</label>
              <input
                type="datetime-local"
                className={field}
                value={eventAt}
                onChange={(e) => setEventAt(e.target.value)}
              />
            </div>
            {isHotel ? (
              <div>
                <label className={label}>
                  Check-out
                  {stayNights > 0 && (
                    <span className="ml-1.5 font-normal text-ink-faint">
                      · {stayNights} night{stayNights === 1 ? "" : "s"}
                    </span>
                  )}
                </label>
                <input
                  type="datetime-local"
                  className={field}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className={label}>Where (optional)</label>
                <input
                  className={field}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Lisbon"
                />
              </div>
            )}
          </div>
          {isHotel && (
            <div>
              <label className={label}>Where (optional)</label>
              <input
                className={field}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Lisbon"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Booked via (optional)</label>
              <input
                className={field}
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Booking.com"
              />
            </div>
            <div>
              <label className={label}>Amount (optional)</label>
              <div className="flex gap-1.5">
                <input
                  inputMode="decimal"
                  className={field}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="240"
                />
                <select
                  className="rounded-lg border border-line bg-paper px-2 text-base text-ink outline-none focus:border-accent"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-paper p-3.5">
            <label className="flex items-center justify-between">
              <span className="text-[14px] font-medium text-ink">
                Can I still cancel this?
              </span>
              <button
                role="switch"
                aria-checked={refundable}
                onClick={() => setRefundable((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  refundable ? "bg-ok" : "bg-line-strong"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
                    refundable ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </label>
            {refundable ? (
              <div className="mt-3">
                <label className={label}>Free cancellation until</label>
                <input
                  type="datetime-local"
                  className={field}
                  value={cancelBy}
                  onChange={(e) => setCancelBy(e.target.value)}
                />
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-ink-faint">
                Locked in — no cancellation reminders, just the countdown to the day.
              </p>
            )}
          </div>

          <div>
            <label className={label}>Reservation link (optional)</label>
            <input
              className={field}
              value={cancelUrl}
              onChange={(e) => setCancelUrl(e.target.value)}
              placeholder="https://… (view/manage the booking)"
              inputMode="url"
            />
          </div>

          {editing && booking?.sourceUrl && (
            <a
              href={booking.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2.5 text-[14px] font-medium text-ink transition-colors hover:border-accent"
            >
              <i
                className="ti ti-mail text-[16px] text-ink-soft"
                aria-hidden="true"
              />
              View source email
              <i
                className="ti ti-external-link ml-auto text-[15px] text-ink-faint"
                aria-hidden="true"
              />
            </a>
          )}

          <div>
            <label className={label}>Notes (optional)</label>
            <textarea
              className={`${field} min-h-[64px] resize-none`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Confirmation #, who's coming…"
            />
          </div>

          {editing && booking && (
            <div>
              <label className={label}>Add to calendar</label>
              <div className="flex flex-wrap gap-2">
                {cancelGcal && (
                  <a
                    href={cancelGcal}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink transition-colors hover:border-line-strong"
                  >
                    <i
                      className="ti ti-calendar text-[16px] text-urgent"
                      aria-hidden="true"
                    />
                    Cancel by {formatEventDate(booking.cancelBy!)}
                  </a>
                )}
                <a
                  href={tripGcal!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink transition-colors hover:border-line-strong"
                >
                  <i
                    className="ti ti-calendar-event text-[16px] text-ink-soft"
                    aria-hidden="true"
                  />
                  Trip · {formatEventDate(booking.eventAt)}
                </a>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {editing ? "Save changes" : "Add to LineUp"}
        </button>

        {editing && booking && (
          <div className="mt-3 flex justify-between">
            <button
              onClick={() => onMarkCancelled(booking.id)}
              className="text-[13px] text-ink-soft hover:text-ink"
            >
              Mark as cancelled
            </button>
            <button
              onClick={() => onDelete(booking.id)}
              className="text-[13px] text-urgent hover:underline"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
