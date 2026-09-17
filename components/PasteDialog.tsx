"use client";

import { useRef, useState } from "react";
import {
  extractFromImages,
  extractFromText,
  type Candidate,
} from "@/lib/extract";

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
  const [shots, setShots] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setText("");
    setShots([]);
  };

  // Screenshots win when both are present: you don't take a photo of a
  // confirmation and then also paste it.
  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const cands = shots.length
        ? await extractFromImages(shots)
        : await extractFromText(text);
      if (cands.length === 0) {
        setError(
          shots.length
            ? "Couldn't read a booking out of that. A screenshot of the confirmation itself usually works better than a photo of a screen."
            : "Didn't find a booking or a plan in that — try the manual form.",
        );
      } else {
        reset();
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
          <h2 className="text-2xl font-semibold text-ink">Add a booking or plan</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full text-ink-faint hover:bg-paper"
          >
            <i className="ti ti-x text-[18px]" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-3 text-[13px] text-ink-soft">
          Paste the text, or add a screenshot of the confirmation. Either
          becomes a booking. A day plan — the kind an AI chat hands you —
          becomes a &ldquo;to book&rdquo; list, with nothing marked as
          reserved.
        </p>
        {shots.length === 0 && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the email text here…"
            className="min-h-[160px] w-full resize-none rounded-lg border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent"
            autoFocus
          />
        )}

        {/* On a phone the confirmation is a screenshot, not text you can
            select. Reading the picture is the same job. */}
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])].slice(0, 4);
            if (picked.length) {
              setShots(picked);
              setError(null);
            }
            e.target.value = "";
          }}
        />

        {shots.length > 0 ? (
          <ul className="space-y-1.5">
            {shots.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2"
              >
                <i
                  className="ti ti-photo shrink-0 text-[16px] text-ink-faint"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {f.name || `Screenshot ${i + 1}`}
                </span>
                <button
                  onClick={() => setShots((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.name || `screenshot ${i + 1}`}`}
                  className="tap grid size-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-line hover:text-ink"
                >
                  <i className="ti ti-x text-[14px]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <button
            onClick={() => picker.current?.click()}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-ink"
          >
            <i className="ti ti-camera text-[16px]" aria-hidden="true" />
            Or add a screenshot
          </button>
        )}

        {error && <p className="mt-2 text-[12px] text-urgent">{error}</p>}
        <button
          onClick={run}
          disabled={loading || (shots.length === 0 && text.trim().length < 20)}
          className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading
            ? "Reading…"
            : shots.length
              ? `Read ${shots.length === 1 ? "the screenshot" : `${shots.length} screenshots`}`
              : "Extract booking"}
        </button>
      </div>
    </div>
  );
}
