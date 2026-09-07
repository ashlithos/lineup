"use client";

import { useEffect, useState } from "react";
import { CATEGORY_META, type Booking } from "@/lib/types";
import type { Candidate, Draft } from "@/lib/extract";
import { countdown, formatEventDate, formatMoney } from "@/lib/urgency";
import { RefundBadge } from "./RefundBadge";
import { AddBookingDialog } from "./AddBookingDialog";

const CONF: Record<Candidate["confidence"], { label: string; cls: string }> = {
  high: { label: "ready", cls: "bg-ok-soft text-ok" },
  check: { label: "check it", cls: "bg-soon-soft text-soon" },
  partial: { label: "needs review", cls: "bg-urgent-soft text-urgent" },
};

export function ReviewSheet({
  open,
  candidates,
  onClose,
  onConfirm,
}: {
  open: boolean;
  candidates: Candidate[];
  onClose: () => void;
  onConfirm: (drafts: Draft[]) => void;
}) {
  const [list, setList] = useState<Candidate[]>([]);
  const [included, setIncluded] = useState<boolean[]>([]);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setList(candidates);
      setIncluded(candidates.map(() => true));
    }
  }, [open, candidates]);

  if (!open) return null;

  const count = included.filter(Boolean).length;
  const confirm = () =>
    onConfirm(list.filter((_, i) => included[i]).map((c) => c.draft));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-paper p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-ink">Review what we found</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full text-ink-faint hover:bg-raised"
          >
            <i className="ti ti-x text-[18px]" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 text-[13px] text-ink-soft">
          {`We pulled ${candidates.length} from your inbox. Untick anything you don't want, or edit to fix a detail.`}
        </p>

        <div className="space-y-2.5">
          {list.map((c, i) => {
            const meta = CATEGORY_META[c.draft.category];
            const conf = CONF[c.confidence];
            const cd = c.draft.cancelBy ? countdown(c.draft.cancelBy) : null;
            const money = formatMoney(c.draft.amount, c.draft.currency);
            return (
              <div
                key={i}
                className={`rounded-xl border bg-raised p-3.5 transition-opacity ${
                  included[i] ? "border-line" : "border-line opacity-45"
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() =>
                      setIncluded((p) => p.map((v, j) => (j === i ? !v : v)))
                    }
                    aria-label={included[i] ? "Exclude" : "Include"}
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border text-[11px] ${
                      included[i]
                        ? "border-accent bg-accent text-white"
                        : "border-line-strong bg-paper text-transparent"
                    }`}
                  >
                    ✓
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{meta.emoji}</span>
                      <span className="truncate text-[15px] font-medium text-ink">
                        {c.draft.title}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <RefundBadge booking={c.draft as Booking} />
                      <span className="text-[11px] text-ink-faint">
                        {formatEventDate(c.draft.eventAt)}
                        {money && ` · ${money}`}
                      </span>
                    </div>
                    {cd && (
                      <p className="mt-1.5 text-[12px] text-soon">
                        Cancel within {cd.text} ({formatEventDate(c.draft.cancelBy!)})
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${conf.cls}`}
                      >
                        {conf.label}
                      </span>
                      <span className="text-[11px] text-ink-faint">
                        {c.sourceLabel}
                      </span>
                      <button
                        onClick={() => setEditIndex(i)}
                        className="ml-auto text-[12px] font-medium text-accent hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={confirm}
          disabled={count === 0}
          className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {count === 0 ? "Nothing selected" : `Add ${count} to LineUp`}
        </button>

        <AddBookingDialog
          open={editIndex !== null}
          booking={
            editIndex !== null
              ? ({
                  ...list[editIndex].draft,
                  id: `cand-${editIndex}`,
                  createdAt: "",
                  status: "upcoming",
                } as Booking)
              : null
          }
          onClose={() => setEditIndex(null)}
          onSave={(draft) => {
            setList((p) =>
              p.map((c, j) =>
                j === editIndex ? { ...c, draft, missing: [] } : c,
              ),
            );
            setEditIndex(null);
          }}
          onDelete={() => setEditIndex(null)}
          onMarkCancelled={() => setEditIndex(null)}
        />
      </div>
    </div>
  );
}
