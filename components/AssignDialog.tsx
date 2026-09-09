"use client";

import { useEffect, useMemo, useState } from "react";
import type { Booking } from "@/lib/types";
import {
  bookByLabel,
  bookUrgency,
  handoffText,
  whenLabel,
  type BookUrgency,
} from "@/lib/handoff";

// Hand the "still to book" list to whoever is actually going to book it.
// Email if it's configured; otherwise the same message, copied or shared —
// the point is that the ask leaves the app, not how it travels.

const WHO_KEY = "lineup.assign.who";
const WHO_EMAIL_KEY = "lineup.assign.whoEmail";
const MY_EMAIL_KEY = "lineup.assign.myEmail";

const URGENCY_STYLE: Record<BookUrgency, string> = {
  overdue: "border-urgent/40 bg-urgent-soft text-urgent",
  now: "border-urgent/40 bg-urgent-soft text-urgent",
  soon: "border-soon/40 bg-soon-soft text-soon",
  later: "border-line bg-paper text-ink-soft",
};

export function AssignDialog({
  items,
  onClose,
  onAssigned,
}: {
  items: Booking[];
  onClose: () => void;
  onAssigned: (ids: string[], who: string, email: string) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(items.map((b) => b.id)),
  );
  const [who, setWho] = useState("");
  const [whoEmail, setWhoEmail] = useState("");
  const [myEmail, setMyEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whoever you asked last time is almost always who you're asking now.
  useEffect(() => {
    setWho(window.localStorage.getItem(WHO_KEY) ?? "");
    setWhoEmail(window.localStorage.getItem(WHO_EMAIL_KEY) ?? "");
    setMyEmail(window.localStorage.getItem(MY_EMAIL_KEY) ?? "");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chosen = useMemo(
    () => items.filter((b) => picked.has(b.id)),
    [items, picked],
  );
  const message = useMemo(
    () =>
      handoffText(chosen, {
        to: who.trim() || undefined,
        forwardTo: myEmail.trim() || undefined,
      }),
    [chosen, who, myEmail],
  );

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remember = () => {
    window.localStorage.setItem(WHO_KEY, who.trim());
    window.localStorage.setItem(WHO_EMAIL_KEY, whoEmail.trim());
    window.localStorage.setItem(MY_EMAIL_KEY, myEmail.trim());
  };

  const markAssigned = () =>
    onAssigned(
      chosen.map((b) => b.id),
      who.trim(),
      whoEmail.trim(),
    );

  const send = async () => {
    if (!chosen.length || !whoEmail.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: whoEmail.trim(),
          toName: who.trim(),
          forwardTo: myEmail.trim(),
          bookings: chosen,
        }),
      });
      if (res.ok) {
        remember();
        markAssigned();
        setSent(true);
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          d.error === "email-not-configured"
            ? "Email isn't set up on this deployment — copy the message or open it in your mail app instead."
            : "That didn't send. Copy the message or open it in your mail app instead.",
        );
      }
    } catch {
      setError("That didn't send. Copy the message or open it in your mail app instead.");
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      remember();
      markAssigned();
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const mailto = `mailto:${encodeURIComponent(whoEmail.trim())}?subject=${encodeURIComponent(
    chosen.length === 1 ? `Could you book: ${chosen[0].title}` : `${chosen.length} things to book`,
  )}&body=${encodeURIComponent(message)}`;

  const share = async () => {
    try {
      await navigator.share({ title: "Still to book", text: message });
      remember();
      markAssigned();
    } catch {
      /* dismissed or unsupported */
    }
  };
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/30 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-raised p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center">
          <span className="text-[15px] font-semibold text-ink">
            Ask someone to book
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid size-9 place-items-center rounded-full text-ink-faint hover:bg-paper"
          >
            <i className="ti ti-x text-[18px]" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 text-[12.5px] leading-snug text-ink-soft">
          They get the list, the dates, how far ahead each one wants booking, and
          where to book it — plus a nudge to forward you the confirmation.
        </p>

        {sent ? (
          <div className="rounded-xl border border-ok/40 bg-ok-soft p-4">
            <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
              <i className="ti ti-circle-check text-[18px] text-ok" aria-hidden="true" />
              Sent to {who.trim() || whoEmail.trim()}
            </div>
            <p className="mt-1.5 text-[12.5px] leading-snug text-ink-soft">
              If anything is still unbooked by its book-by date, they&apos;ll get a
              reminder — and each one asks them to forward you the confirmation.
            </p>
            <button
              onClick={onClose}
              className="mt-3 w-full rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <fieldset className="mb-4">
              <legend className="mb-2 text-[13px] text-ink-soft">
                What are they booking?
              </legend>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {items.map((b) => {
                  const on = picked.has(b.id);
                  return (
                    <li key={b.id}>
                      <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(b.id)}
                          className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-medium leading-snug text-ink">
                            {b.title}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] text-ink-faint">
                            {whenLabel(b)}
                            {b.location ? ` · ${b.location}` : ""}
                          </span>
                          <span
                            className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              URGENCY_STYLE[bookUrgency(b)]
                            }`}
                          >
                            {bookByLabel(b)}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <div className="mb-4 space-y-2.5">
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-ink-soft">Who</span>
                <input
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  placeholder="Name"
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-ink-soft">
                  Their email
                </span>
                <input
                  type="email"
                  value={whoEmail}
                  onChange={(e) => setWhoEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-ink-soft">
                  Forward confirmations to
                </span>
                <input
                  type="email"
                  value={myEmail}
                  onChange={(e) => setMyEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent"
                />
              </label>
            </div>

            <details className="mb-4 rounded-xl border border-line bg-paper">
              <summary className="cursor-pointer px-3 py-2.5 text-[12.5px] font-medium text-ink-soft">
                Preview the message
              </summary>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-line px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-ink-soft">
                {message}
              </pre>
            </details>

            {error && (
              <p className="mb-3 rounded-lg border border-urgent/40 bg-urgent-soft px-3 py-2 text-[12.5px] leading-snug text-ink">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={send}
                disabled={!chosen.length || !whoEmail.trim() || sending}
                className="flex-1 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send email"}
              </button>
              <button
                onClick={copy}
                disabled={!chosen.length}
                className="rounded-lg border border-line px-4 py-2.5 text-[13px] font-medium text-ink-soft disabled:opacity-40 hover:text-ink"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              {canShare && (
                <button
                  onClick={share}
                  disabled={!chosen.length}
                  aria-label="Share the message"
                  className="grid size-[42px] shrink-0 place-items-center rounded-lg border border-line text-ink-soft disabled:opacity-40 hover:text-ink"
                >
                  <i className="ti ti-share-2 text-[16px]" aria-hidden="true" />
                </button>
              )}
            </div>
            <a
              href={mailto}
              onClick={() => {
                remember();
                markAssigned();
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-accent hover:underline"
            >
              Open in my mail app instead
              <i className="ti ti-external-link text-[13px]" aria-hidden="true" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}
