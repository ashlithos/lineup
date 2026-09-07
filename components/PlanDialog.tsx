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

const CHECKLIST_SUGGESTIONS = ["Flights", "Hotel", "Activities", "Rental car"];

type Draft = Omit<Booking, "id" | "createdAt" | "status">;

const CURRENCIES = ["USD", "CAD", "EUR", "GBP"];

// A want-to-book item. Lighter than a real booking — no dates, no cancellation.
// We reuse cancelUrl as "where you'll book it" and amount as a rough budget.
export function PlanDialog({
  open,
  plan,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  plan: Booking | null;
  onClose: () => void;
  onSave: (draft: Draft, id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const editing = !!plan;
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("trip");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [roughMonth, setRoughMonth] = useState(""); // "YYYY-MM" or ""
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [photoInput, setPhotoInput] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [companions, setCompanions] = useState<string[]>([]);

  // "9999-01-01…" is the sentinel for undated plan items.
  const isUndated = (iso: string) => iso.startsWith("9999");

  useEffect(() => {
    if (!open) return;
    setTitle(plan?.title ?? "");
    setCategory(plan?.category ?? "trip");
    setAmount(plan?.amount != null ? String(plan.amount) : "");
    setCurrency(plan?.currency ?? "USD");
    setNotes(plan?.notes ?? "");
    setChecklist(plan?.checklist ?? []);
    setNewItem("");
    setImageUrl(plan?.imageUrl ?? "");
    setPhotoInput("");
    setCompanions(plan?.companions ?? []);
    const iso = plan?.eventAt ?? "";
    setRoughMonth(!iso || isUndated(iso) ? "" : iso.slice(0, 7));
  }, [open, plan]);

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

  const canSave = title.trim() !== "";

  const handleSave = () => {
    if (!canSave) return;
    onSave(
      {
        title: title.trim(),
        category,
        cancelUrl: plan?.cancelUrl,
        amount: amount.trim() ? Number(amount) : undefined,
        currency,
        refundable: false,
        notes: notes.trim() || undefined,
        imageUrl: category === "trip" ? imageUrl : undefined,
        checklist:
          category === "trip" && checklist.length ? checklist : undefined,
        companions: companions.length ? companions : undefined,
        eventAt: roughMonth
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
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-raised p-5 sm:rounded-2xl"
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

          <div>
            <label className={label}>Type</label>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_CATEGORY_ORDER.map((c) => (
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

          {category === "trip" && (
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

          {category === "trip" && (
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

          <div>
            <label className={label}>Rough budget (optional)</label>
            <div className="flex gap-1.5">
              <input
                inputMode="decimal"
                className={field}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="400"
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

          <div>
            <label className={label}>Rough timing (optional)</label>
            <MonthPicker value={roughMonth} onChange={setRoughMonth} />
          </div>

          <div>
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
            <label className={label}>Notes (optional)</label>
            <textarea
              className={`${field} min-h-[64px] resize-none`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why, who's coming, when tickets drop…"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {editing ? "Save changes" : "Add to plan"}
        </button>

        {editing && plan && (
          <button
            onClick={() => onDelete(plan.id)}
            className="mt-3 block w-full text-center text-[13px] text-urgent hover:underline"
          >
            Remove from plan
          </button>
        )}
      </div>
    </div>
  );
}
