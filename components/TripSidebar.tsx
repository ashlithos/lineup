"use client";

import { useEffect, useState } from "react";
import type { Trip } from "@/lib/trips";
import { tripTotals } from "@/lib/chapters";
import { stockTripImage } from "@/lib/tripImage";

const cityOf = (loc?: string) =>
  loc ? loc.split("→").pop()!.split(",")[0].trim() : "";

// Desktop-only companion to the day agenda: a photo to look forward to plus a
// couple of calm facts. The photo auto-fills from Pexels (cached on the trip),
// and can be swapped by upload or pasted URL.
export function TripSidebar({
  trip,
  onSetImage,
}: {
  trip: Trip;
  onSetImage: (url: string | undefined) => void;
}) {
  const stock = stockTripImage(
    [trip.label, ...trip.bookings.map((b) => b.location ?? "")].join(" "),
  );
  // Best search term: a real destination city, not the trip's nickname.
  const dest =
    trip.bookings
      .filter((b) => b.category !== "flight")
      .map((b) => cityOf(b.location))
      .find(Boolean) ||
    trip.bookings.map((b) => cityOf(b.location)).find(Boolean) ||
    trip.label;

  const [auto, setAuto] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [broken, setBroken] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Auto-fetch a destination photo when none is set yet, then cache it on the
  // trip so it never refetches.
  useEffect(() => {
    if (trip.image) return;
    let active = true;
    fetch(`/api/trip-photo?q=${encodeURIComponent(dest)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.url) {
          setAuto(d.url);
          onSetImage(d.url);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.key, trip.image, dest]);

  const src = (!broken && trip.image) || auto || stock;

  // Totals come from the trip's real span and its grouped stays — not from how
  // many rows the agenda renders.
  const { days, nights, stays, legs } = tripTotals(trip.bookings);

  const saveUrl = () => {
    setAuto(null);
    setBroken(false);
    onSetImage(url.trim() || undefined);
    setEditing(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = (await r.json()) as { url?: string };
      if (d.url) {
        setAuto(null);
        setBroken(false);
        onSetImage(d.url);
        setEditing(false);
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="lg:sticky lg:top-6">
      <div className="group relative overflow-hidden rounded-2xl border border-line bg-paper">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={trip.label}
          onError={() => setBroken(true)}
          className="aspect-[4/3] w-full object-cover"
        />
        <button
          onClick={() => {
            setUrl(trip.image ?? "");
            setEditing((v) => !v);
          }}
          className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
        >
          <i className="ti ti-photo text-[13px]" aria-hidden="true" /> Change photo
        </button>
      </div>

      {editing && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveUrl();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="Paste an image URL"
              inputMode="url"
              className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
            />
            <button
              onClick={saveUrl}
              className="shrink-0 rounded-lg bg-ink px-2.5 py-1.5 text-[12px] font-medium text-paper"
            >
              Save
            </button>
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-2 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-ink">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <i className="ti ti-upload text-[14px]" aria-hidden="true" />
            {uploading ? "Uploading…" : "Upload from your device"}
          </label>
        </div>
      )}

      <div className="mt-3 px-0.5">
        <p className="text-[15px] font-medium text-ink">{trip.label}</p>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          {trip.dateRange} · {days} days · {nights}{" "}
          {nights === 1 ? "night" : "nights"}
        </p>
        {(stays > 0 || legs > 0) && (
          <p className="mt-1.5 text-[12px] text-ink-faint">
            {stays > 0 && `${stays} ${stays === 1 ? "stay" : "stays"}`}
            {stays > 0 && legs > 0 && " · "}
            {legs > 0 && `${legs} travel ${legs === 1 ? "leg" : "legs"}`}
          </p>
        )}
      </div>
    </div>
  );
}
