"use client";

import { useEffect, useRef, useState } from "react";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// A rough-month picker — a tap-a-tile popover, far nicer on desktop than the
// native <input type="month">. Value is "YYYY-MM" (or "" for none).
export function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() =>
    value ? Number(value.slice(0, 4)) : now.getFullYear(),
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const selYear = value ? Number(value.slice(0, 4)) : -1;
  const selMonth = value ? Number(value.slice(5, 7)) - 1 : -1;
  const label = value ? `${MONTHS[selMonth]} ${selYear}` : "Pick a month";

  const pick = (m: number) => {
    onChange(`${year}-${String(m + 1).padStart(2, "0")}`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between rounded-lg border bg-paper px-3 py-2.5 text-base outline-none transition-colors ${
          open ? "border-accent" : "border-line"
        } ${value ? "text-ink" : "text-ink-faint"}`}
      >
        <span className="flex items-center gap-2">
          <i className="ti ti-calendar text-[16px] text-ink-faint" aria-hidden="true" />
          {label}
        </span>
        <i
          className={`ti ti-chevron-down text-[16px] text-ink-faint transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute inset-x-0 z-20 mt-1.5 rounded-xl border border-line bg-raised p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              disabled={year <= now.getFullYear()}
              aria-label="Previous year"
              className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-paper disabled:opacity-30"
            >
              <i className="ti ti-chevron-left text-[16px]" aria-hidden="true" />
            </button>
            <span className="text-[14px] font-medium text-ink">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
              className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-paper"
            >
              <i className="ti ti-chevron-right text-[16px]" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((m, i) => {
              const past = year === now.getFullYear() && i < now.getMonth();
              const sel = selYear === year && selMonth === i;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={past}
                  onClick={() => pick(i)}
                  className={`rounded-lg py-2 text-[13px] font-medium transition-colors ${
                    sel
                      ? "bg-accent text-white"
                      : past
                        ? "text-ink-faint opacity-40"
                        : "text-ink-soft hover:bg-paper"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="mt-2 w-full rounded-lg py-1.5 text-[12px] text-ink-faint transition-colors hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
