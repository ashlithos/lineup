"use client";

import { useEffect, useState } from "react";
import {
  CATEGORY_META,
  COMPANION_OPTIONS,
  PLAN_CATEGORY_ORDER,
  type Booking,
  type Category,
  type ChecklistItem,
} from "@/lib/types";
import { MonthPicker } from "@/components/MonthPicker";
import { localDate, localDayMs } from "@/lib/localtime";
import { PlanTimetable } from "@/components/PlanTimetable";
import type { Trip } from "@/lib/trips";

const CHECKLIST_SUGGESTIONS = ["Flights", "Hotel", "Activities", "Rental car"];

type Draft = Omit<Booking, "id" | "createdAt" | "status">;

const DAY_MS = 86_400_000;

// Suggested lengths, in minutes. A plan isn't booked, so this is a guess about
// how much of the day it eats — enough to plan the rest of the day around.
const DURATIONS: [number, string][] = [
  [30, "30 minutes"],
  [60, "1 hour"],
  [90, "1½ hours"],
  [120, "2 hours"],
  [180, "3 hours"],
  [240, "Half a day"],
  [480, "Most of the day"],
];

/** Every calendar day the trip covers, as "YYYY-MM-DD". */
function tripDayList(trip: Trip): string[] {
  const stamps = trip.bookings
    .flatMap((b) => [b.eventAt, b.checkOut])
    .filter((d): d is string => !!d)
    .map(localDayMs);
  if (!stamps.length) return [];
  const out: string[] = [];
  for (let d = Math.min(...stamps); d <= Math.max(...stamps); d += DAY_MS) {
    out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}

const dayOption = (d: string) =>
  localDate(`${d}T00:00`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

// A want-to-book item. Lighter than a real booking — no dates, no cancellation.
// We reuse cancelUrl as "where you'll book it".
export function PlanDialog({
  open,
  plan,
  trips,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  plan: Booking | null;
  /** Trips already on the calendar, so a plan can be pinned to a day of one. */
  trips?: Trip[];
  onClose: () => void;
  onSave: (draft: Draft, id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const editing = !!plan;
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("trip");
  const [notes, setNotes] = useState("");
  const [roughMonth, setRoughMonth] = useState(""); // "YYYY-MM" or ""
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [photoInput, setPhotoInput] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [companions, setCompanions] = useState<string[]>([]);
  // Pinning to a trip turns a someday-wish into a dated thing that still has
  // to be booked — brunch on the Saturday of a trip you've already booked.
  const [tripKey, setTripKey] = useState("");
  const [location, setLocation] = useState("");
  const [bookUrl, setBookUrl] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("11:00");
  const [confirmRemove, setConfirmRemove] = useState(false);

  // "9999-01-01…" is the sentinel for undated plan items.
  const isUndated = (iso: string) => iso.startsWith("9999");

  useEffect(() => {
    if (!open) return;
    setTitle(plan?.title ?? "");
    setCategory(plan?.category ?? "trip");
    setNotes(plan?.notes ?? "");
    setChecklist(plan?.checklist ?? []);
    setNewItem("");
    setImageUrl(plan?.imageUrl ?? "");
    setPhotoInput("");
    setCompanions(plan?.companions ?? []);
    setLocation(plan?.location ?? "");
    setBookUrl(plan?.cancelUrl ?? "");
    setDurationMin(plan?.durationMin != null ? String(plan.durationMin) : "");
    const iso = plan?.eventAt ?? "";
    setRoughMonth(!iso || isUndated(iso) ? "" : iso.slice(0, 7));
    // An item pasted from an itinerary has a date but no trip name, so fall
    // back to whichever trip actually covers that day.
    const onTrip =
      trips?.find((t) => t.label === plan?.tripName) ??
      (iso && !isUndated(iso)
        ? trips?.find((t) => !t.isOther && tripDayList(t).includes(iso.slice(0, 10)))
        : undefined);
    setConfirmRemove(false);
    setTripKey(onTrip?.key ?? "");
    const hasDate = !!iso && !isUndated(iso);
    setDay(hasDate ? iso.slice(0, 10) : "");
    setTime(hasDate && iso.length > 15 ? iso.slice(11, 16) : "11:00");
  }, [open, plan, trips]);

  const addItem = (raw: string) => {
    const label = raw.trim();
    if (!label) return;
    setChecklist((c) => [
      ...c,
      { id: crypto.randomUUID(), label, done: false },
    ]);
    setNewItem("");
  };
  const toggleItem = (id: string) =>
    setChecklist((c) =>
      c.map((it) => (it.id === id ? { ...it, done: !it.done } : it)),
    );
  const removeItem = (id: string) =>
    setChecklist((c) => c.filter((it) => it.id !== id));
  const setItemLabel = (id: string, label: string) =>
    setChecklist((c) => c.map((it) => (it.id === id ? { ...it, label } : it)));
  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = (await r.json()) as { url?: string };
      if (d.url) setImageUrl(d.url);
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // "solo" is exclusive; the rest stack.
  const toggleCompanion = (v: string) =>
    setCompanions((c) => {
      if (v === "solo") return c.includes("solo") ? [] : ["solo"];
      const rest = c.filter((x) => x !== "solo");
      return rest.includes(v) ? rest.filter((x) => x !== v) : [...rest, v];
    });

  // A trip can't live inside a trip, and "Other" groups aren't real trips.
  const tripOptions = (trips ?? []).filter((t) => !t.isOther);
  const trip = tripOptions.find((t) => t.key === tripKey);
  const days = trip ? tripDayList(trip) : [];
  const onTrip = !!trip;
  // A plan that already has a day keeps it. Until now, opening one and saving
  // without a trip selected quietly replaced its date with a rough month —
  // which took it off the timetable it was sitting on.
  const dated = onTrip || !!day;

  const canSave = title.trim() !== "" && (!dated || !!day);

  const handleSave = () => {
    if (!canSave) return;
    onSave(
      {
        title: title.trim(),
        category,
        location: location.trim() || undefined,
        cancelUrl: bookUrl.trim() || undefined,
        durationMin: dated && durationMin ? Number(durationMin) : plan?.durationMin,
        // A budget is no longer asked for here, but one already written down
        // shouldn't be thrown away by an edit.
        amount: plan?.amount,
        currency: plan?.currency ?? "USD",
        refundable: false,
        notes: notes.trim() || undefined,
        imageUrl: category === "trip" ? imageUrl : undefined,
        checklist:
          category === "trip" && checklist.length ? checklist : undefined,
        companions: companions.length ? companions : undefined,
        tripName: onTrip ? trip!.label : plan?.tripName,
        eventAt: dated
          ? `${day}T${time}:00`
          : roughMonth
            ? `${roughMonth}-01T00:00:00.000Z`
            : "9999-01-01T00:00:00.000Z",
      },
      plan?.id ?? null,
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
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-raised p-5 sm:rounded-2xl ${
          onTrip ? "max-w-md lg:max-w-4xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-ink">
            {editing ? "Edit plan" : "Add to plan"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full text-ink-faint hover:bg-paper"
          >
            <i className="ti ti-x text-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div
          className={
            onTrip
              ? "lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-6"
              : undefined
          }
        >
        <div className="space-y-3.5">
          <div>
            <label className={label}>What do you want to book?</label>
            <input
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Outside Lands, Vegas trip…"
              autoFocus
            />
          </div>

          {tripOptions.length > 0 && (
            <div>
              <label className={label}>Part of a trip?</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTripKey("")}
                  className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                    !onTrip
                      ? "border-ink bg-ink text-paper"
                      : "border-line bg-paper text-ink-soft hover:border-line-strong"
                  }`}
                >
                  On its own
                </button>
                {tripOptions.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setTripKey(t.key);
                      if (category === "trip") setCategory("other");
                    }}
                    className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                      tripKey === t.key
                        ? "border-ink bg-ink text-paper"
                        : "border-line bg-paper text-ink-soft hover:border-line-strong"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {onTrip && (
                <p className="mt-1.5 text-[12px] text-ink-faint">
                  Lands on that day&apos;s timetable under &ldquo;Still to
                  book&rdquo; — not booked, but real enough to plan around.
                </p>
              )}
            </div>
          )}

          <div>
            <label className={label}>Type</label>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_CATEGORY_ORDER.filter((c) => !onTrip || c !== "trip").map((c) => (
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

          {category === "trip" && !onTrip && (
            <div>
              <label className={label}>Photo (optional)</label>
              {imageUrl ? (
                <div className="relative overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-28 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    aria-label="Remove photo"
                    className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-ink/70 text-white backdrop-blur transition-colors hover:bg-ink"
                  >
                    <i className="ti ti-trash text-[14px]" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      value={photoInput}
                      onChange={(e) => setPhotoInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (photoInput.trim()) setImageUrl(photoInput.trim());
                        }
                      }}
                      placeholder="Paste an image URL"
                      inputMode="url"
                      className={`${field} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        photoInput.trim() && setImageUrl(photoInput.trim())
                      }
                      className="shrink-0 rounded-lg border border-line-strong px-3 text-[13px] font-medium text-ink transition-colors hover:bg-paper"
                    >
                      Add
                    </button>
                  </div>
                  <label className="flex cursor-pointer items-center justify-center gap-1.5 text-[12px] text-ink-faint transition-colors hover:text-ink">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={uploadPhoto}
                      disabled={uploadingPhoto}
                    />
                    <i className="ti ti-upload text-[13px]" aria-hidden="true" />
                    {uploadingPhoto ? "Uploading…" : "or upload from your device"}
                  </label>
                </div>
              )}
            </div>
          )}

          {category === "trip" && !onTrip && (
            <div>
              <label className={label}>What needs booking?</label>
              {checklist.length > 0 && (
                <div className="mb-2 space-y-1.5">
                  {checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleItem(item.id)}
                        aria-label={item.done ? "Mark not booked" : "Mark booked"}
                        className={`grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
                          item.done
                            ? "border-accent bg-accent text-white"
                            : "border-line-strong text-transparent hover:border-accent"
                        }`}
                      >
                        <i className="ti ti-check text-[12px]" aria-hidden="true" />
                      </button>
                      <input
                        value={item.label}
                        onChange={(e) => setItemLabel(item.id, e.target.value)}
                        className={`flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[14px] outline-none focus:border-accent ${
                          item.done ? "text-ink-faint line-through" : "text-ink"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label="Remove item"
                        className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:text-urgent"
                      >
                        <i className="ti ti-x text-[15px]" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(newItem);
                    }
                  }}
                  placeholder="Flights, hotel, activities…"
                  className={`${field} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => addItem(newItem)}
                  className="shrink-0 rounded-lg border border-line-strong px-3 text-[13px] font-medium text-ink transition-colors hover:bg-paper"
                >
                  Add
                </button>
              </div>
              {CHECKLIST_SUGGESTIONS.some(
                (s) =>
                  !checklist.some(
                    (c) => c.label.toLowerCase() === s.toLowerCase(),
                  ),
              ) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CHECKLIST_SUGGESTIONS.filter(
                    (s) =>
                      !checklist.some(
                        (c) => c.label.toLowerCase() === s.toLowerCase(),
                      ),
                  ).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addItem(s)}
                      className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-soft transition-colors hover:border-line-strong"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {dated ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Which day?</label>
                {onTrip ? (
                  <select
                    className={field}
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  >
                    <option value="">Pick a day</option>
                    {days.map((d) => (
                      <option key={d} value={d}>
                        {dayOption(d)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="date"
                    className={field}
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                )}
              </div>
              <div>
                <label className={label}>What time?</label>
                <input
                  type="time"
                  className={field}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className={label}>How long? (optional)</label>
                <select
                  className={field}
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                >
                  <option value="">Use a typical length</option>
                  {DURATIONS.map(([mins, text]) => (
                    <option key={mins} value={mins}>
                      {text}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[12px] text-ink-faint">
                  How much of the day it takes — this is the space it holds on
                  the timetable.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <label className={label}>Rough timing (optional)</label>
              <MonthPicker value={roughMonth} onChange={setRoughMonth} />
            </div>
          )}

          <div className={onTrip ? "hidden" : undefined}>
            <label className={label}>Who&apos;s coming? (optional)</label>
            <div className="flex flex-wrap gap-1.5">
              {COMPANION_OPTIONS.map((o) => {
                const active = companions.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleCompanion(o.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                      active
                        ? "border-ink bg-ink text-paper"
                        : "border-line bg-paper text-ink-soft hover:border-line-strong"
                    }`}
                  >
                    <i className={`ti ${o.icon} text-[14px]`} aria-hidden="true" />
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={label}>Where (optional)</label>
            <input
              className={field}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Mile End, Montreal"
            />
          </div>

          <div>
            <label className={label}>Where to book it (optional)</label>
            <input
              className={field}
              value={bookUrl}
              onChange={(e) => setBookUrl(e.target.value)}
              placeholder="https://… (the page you'd book on)"
              inputMode="url"
            />
          </div>

          <div>
            <label className={label}>Notes (optional)</label>
            <textarea
              className={`${field} min-h-[64px] resize-none`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why, who's coming, when tickets drop…"
            />
          </div>
        </div>

          {onTrip && (
            <div className="mt-4 lg:mt-0">
              <PlanTimetable
                bookings={trip!.bookings}
                day={day}
                time={time}
                durationMin={durationMin ? Number(durationMin) : 90}
                onPick={(d, t) => {
                  setDay(d);
                  if (t) setTime(t);
                }}
              />
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {editing ? "Save plan" : "Add to plan"}
        </button>

        {editing && plan && (
          <button
            onClick={() => {
              if (!confirmRemove) {
                setConfirmRemove(true);
                setTimeout(() => setConfirmRemove(false), 5000);
                return;
              }
              onDelete(plan.id);
            }}
            className={`mt-3 block w-full text-center text-[13px] text-urgent ${
              confirmRemove ? "font-semibold" : "hover:underline"
            }`}
          >
            {confirmRemove ? "Tap again to remove" : "Remove from plan"}
          </button>
        )}
      </div>
    </div>
  );
}
