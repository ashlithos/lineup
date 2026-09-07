"use client";

import { useEffect, useState } from "react";
import type { Booking } from "@/lib/types";
import {
  runRules,
  sortFindings,
  toModelShape,
  type Finding,
  type Severity,
} from "@/lib/planCheck";

const DISMISSED = "lineup.plancheck.dismissed";
const VOTES = "lineup.plancheck.votes";

type Vote = "up" | "down";
interface VoteRecord {
  vote: Vote;
  title: string;
  source: "rules" | "ai";
}

function loadVotes(): Record<string, VoteRecord> {
  try {
    return JSON.parse(window.localStorage.getItem(VOTES) ?? "{}");
  } catch {
    return {};
  }
}

const SEV: Record<Severity, { label: string; chip: string }> = {
  conflict: { label: "Conflict", chip: "bg-urgent-soft text-urgent" },
  check: { label: "Worth checking", chip: "bg-soon-soft text-soon" },
  tidy: { label: "Tidy up", chip: "bg-accent-soft text-accent" },
};

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(DISMISSED) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function PlanCheckSheet({
  open,
  bookings,
  onClose,
  onOpenBooking,
}: {
  open: boolean;
  bookings: Booking[];
  onClose: () => void;
  onOpenBooking: (b: Booking) => void;
}) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [aiState, setAiState] = useState<"idle" | "running" | "done" | "off">(
    "idle",
  );
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [votes, setVotes] = useState<Record<string, VoteRecord>>({});

  useEffect(() => {
    if (!open) return;
    setDismissed(loadDismissed());
    const v = loadVotes();
    setVotes(v);
    // Rules first — instant, free, and never wrong.
    const rules = runRules(bookings);
    setFindings(rules);
    // Then the model, for the judgment calls rules can't make.
    setAiState("running");
    const live = bookings.filter((b) => b.status === "upcoming");
    fetch("/api/plan-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookings: live.map(toModelShape),
        // Things you marked unhelpful last time, so the model stops repeating them.
        rejected: Object.values(v)
          .filter((r) => r.vote === "down" && r.source === "ai")
          .map((r) => r.title)
          .slice(0, 12),
      }),
    })
      .then((r) => r.json())
      .then((d: { findings?: Finding[]; skipped?: string }) => {
        if (d.skipped) {
          setAiState("off");
          return;
        }
        setFindings((prev) => sortFindings([...prev, ...(d.findings ?? [])]));
        setAiState("done");
      })
      .catch(() => setAiState("off"));
  }, [open, bookings]);

  if (!open) return null;

  const visible = findings.filter(
    (f) => !dismissed.has(f.id) && votes[f.id]?.vote !== "down",
  );
  const castVote = (f: Finding, vote: Vote) => {
    const next = { ...votes };
    if (next[f.id]?.vote === vote) delete next[f.id];
    else next[f.id] = { vote, title: f.title, source: f.source };
    setVotes(next);
    window.localStorage.setItem(VOTES, JSON.stringify(next));
  };
  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    window.localStorage.setItem(DISMISSED, JSON.stringify([...next]));
  };
  const resetDismissed = () => {
    setDismissed(new Set());
    window.localStorage.removeItem(DISMISSED);
  };

  const byId = new Map(bookings.map((b) => [b.id, b]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-raised sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-medium text-ink">Plan check</h2>
            <p className="mt-0.5 text-[13px] text-ink-faint">
              {visible.length === 0
                ? "Nothing to flag."
                : `${visible.length} thing${visible.length === 1 ? "" : "s"} to look at`}
              {aiState === "running" && " · still checking…"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-paper hover:text-ink"
          >
            <i className="ti ti-x text-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {visible.length === 0 && aiState !== "running" && (
            <div className="py-8 text-center">
              <p className="text-[15px] text-ink">Your plan looks sound.</p>
              <p className="mt-1 text-[13px] text-ink-faint">
                No conflicts, no missing deadlines, nothing double-booked.
              </p>
            </div>
          )}

          <ul className="space-y-2.5">
            {visible.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-line bg-paper px-3.5 py-3"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEV[f.severity].chip}`}
                  >
                    {SEV[f.severity].label}
                  </span>
                  {f.source === "ai" && (
                    <span
                      title="Found by the AI pass"
                      className="grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-accent"
                    >
                      <i
                        className="ti ti-pencil-bolt text-[14px]"
                        aria-hidden="true"
                      />
                      <span className="sr-only">Found by the AI pass</span>
                    </span>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => castVote(f, "up")}
                      aria-label="Helpful"
                      aria-pressed={votes[f.id]?.vote === "up"}
                      title="Helpful"
                      className={`grid size-7 place-items-center rounded-md transition-colors hover:bg-line ${
                        votes[f.id]?.vote === "up"
                          ? "text-ok"
                          : "text-ink-faint hover:text-ink"
                      }`}
                    >
                      <i className="ti ti-thumb-up text-[15px]" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => castVote(f, "down")}
                      aria-label="Not useful — hide this and stop suggesting it"
                      title="Not useful"
                      className="grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-line hover:text-ink"
                    >
                      <i className="ti ti-thumb-down text-[15px]" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => dismiss(f.id)}
                      aria-label="Dismiss for now"
                      title="Dismiss for now"
                      className="grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-line hover:text-ink"
                    >
                      <i className="ti ti-x text-[15px]" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[14px] font-medium leading-snug text-ink">
                  {f.title}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                  {f.detail}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {f.bookingIds.map((id) => {
                    const b = byId.get(id);
                    if (!b) return null;
                    return (
                      <span key={id} className="inline-flex items-center">
                        <button
                          onClick={() => {
                            onClose();
                            onOpenBooking(b);
                          }}
                          className="rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                        >
                          {b.title.length > 30
                            ? `${b.title.slice(0, 30)}…`
                            : b.title}
                        </button>
                        {/* When something is missing, the confirmation email is
                            usually where the answer is — one hop, not a hunt. */}
                        {b.sourceUrl && (
                          <a
                            href={b.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open the confirmation email"
                            title="Open the confirmation email"
                            className="ml-1 grid size-6 place-items-center rounded-md text-ink-faint transition-colors hover:bg-line hover:text-ink"
                          >
                            <i className="ti ti-mail text-[13px]" aria-hidden="true" />
                          </a>
                        )}
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>

          {aiState === "running" && (
            <p className="mt-3 text-center text-[12px] text-ink-faint">
              Checking the itinerary for real-world snags…
            </p>
          )}
          {aiState === "off" && (
            <p className="mt-3 text-center text-[12px] text-ink-faint">
              Ran the built-in checks only — the AI pass isn&apos;t available
              right now.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-[11px] text-ink-faint">
            Nothing here changes your bookings.
          </p>
          {(dismissed.size > 0 ||
            Object.values(votes).some((v) => v.vote === "down")) && (
            <button
              onClick={() => {
                resetDismissed();
                setVotes({});
                window.localStorage.removeItem(VOTES);
              }}
              className="shrink-0 text-[12px] font-medium text-accent underline"
            >
              Show hidden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
