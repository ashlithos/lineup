"use client";

import { useEffect, useState } from "react";
import type { Trip } from "@/lib/trips";
import { isTransport } from "@/lib/types";
import { tripDays } from "@/lib/agenda";
import { localDate } from "@/lib/localtime";

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  localDate(iso).toLocaleDateString("en-US", { timeZone: "UTC", ...o });

export function ShareModal({
  trip,
  onClose,
}: {
  trip: Trip;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const bookings = trip.bookings;
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${bookings[0]?.id}`
      : "";

  const flights = bookings.filter((b) => isTransport(b.category)).length;
  const hotels = bookings.filter((b) => b.category === "hotel").length;
  const gaps = tripDays(bookings).filter((d) => d.gap).length;
  const stamps = bookings
    .flatMap((b) => [b.eventAt, b.checkOut])
    .filter(Boolean)
    .map((d) => +new Date(d as string));
  const range = stamps.length
    ? `${fmt(new Date(Math.min(...stamps)).toISOString(), { month: "short", day: "numeric" })} – ${fmt(
        new Date(Math.max(...stamps)).toISOString(),
        { month: "short", day: "numeric", year: "numeric" },
      )}`
    : "";
  const bookedBits = [
    flights > 0 && `${flights} flight${flights === 1 ? "" : "s"}`,
    hotels > 0 && `${hotels} hotel${hotels === 1 ? "" : "s"}`,
  ].filter(Boolean);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };
  const nativeShare = async () => {
    try {
      await navigator.share({ title: `${trip.label} — trip plan`, url: link });
    } catch {
      /* dismissed or unsupported */
    }
  };
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl border border-line bg-raised p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center">
          <span className="text-[15px] font-semibold text-ink">Share trip</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid size-9 place-items-center rounded-full text-ink-faint hover:bg-paper"
          >
            <i className="ti ti-x text-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="mb-4 rounded-xl bg-paper p-4">
          <div className="font-serif text-lg leading-tight text-ink">
            {trip.label}
          </div>
          {range && (
            <div className="mb-2.5 text-[12px] text-ink-faint">{range}</div>
          )}
          {bookedBits.length > 0 && (
            <div className="flex items-center gap-2 text-[13px] text-ink">
              <i
                className="ti ti-circle-check text-[16px] text-ok"
                aria-hidden="true"
              />
              {bookedBits.join(", ")} booked
            </div>
          )}
          {gaps > 0 && (
            <div className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-soft">
              <i
                className="ti ti-circle text-[16px] text-ink-faint"
                aria-hidden="true"
              />
              {gaps} night{gaps === 1 ? "" : "s"} still to sort
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 truncate rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-[12px] text-ink-soft outline-none"
          />
          <button
            onClick={copy}
            className="shrink-0 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[12px] text-accent hover:underline"
          >
            Open full preview
            <i className="ti ti-external-link text-[13px]" aria-hidden="true" />
          </a>
          {canShare && (
            <button
              onClick={nativeShare}
              className="flex items-center gap-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              <i className="ti ti-share-2 text-[14px]" aria-hidden="true" />
              Share…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
