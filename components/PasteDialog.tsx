"use client";

import { useState } from "react";
import { extractFromText, type Candidate } from "@/lib/extract";

export function PasteDialog({
  open,
  onClose,
  onExtracted,
}: {
  open: boolean;
  onClose: () => void;
  onExtracted: (candidates: Candidate[]) => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const cands = await extractFromText(text);
      if (cands.length === 0) {
        setError("Didn't find a booking or a plan in that — try the manual form.");
      } else {
        setText("");
        onExtracted(cands);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-line bg-raised p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-ink">Paste a booking or plan</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full text-ink-faint hover:bg-paper"
          >
            <i className="ti ti-x text-[18px]" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-3 text-[13px] text-ink-soft">
          A confirmation email becomes a booking. A day plan — the kind an AI
          chat hands you — becomes a &ldquo;to book&rdquo; list, with nothing
          marked as reserved.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the email text here…"
          className="min-h-[160px] w-full resize-none rounded-lg border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent"
          autoFocus
        />
        {error && <p className="mt-2 text-[12px] text-urgent">{error}</p>}
        <button
          onClick={run}
          disabled={loading || text.trim().length < 20}
          className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "Reading…" : "Extract booking"}
        </button>
      </div>
    </div>
  );
}
