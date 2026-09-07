"use client";

// The Scan / Paste / Manual choices — shared by the desktop header button and
// the mobile FAB. Positioning is handled by the caller's wrapper.
export function AddMenu({
  onScan,
  onPaste,
  onManual,
}: {
  onScan: () => void;
  onPaste: () => void;
  onManual: () => void;
}) {
  return (
    <div className="w-60 overflow-hidden rounded-2xl bg-raised shadow-xl shadow-ink/10">
      <button
        onClick={onScan}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-paper"
      >
        <i className="ti ti-mail-down mt-0.5 text-[18px] text-ink-soft" aria-hidden="true" />
        <span>
          <span className="block text-[14px] font-medium text-ink">Scan my email</span>
          <span className="block text-[12px] text-ink-soft">Pull bookings automatically</span>
        </span>
      </button>
      <button
        onClick={onPaste}
        className="flex w-full items-start gap-3 border-t border-line px-4 py-3 text-left hover:bg-paper"
      >
        <i className="ti ti-clipboard-text mt-0.5 text-[18px] text-ink-soft" aria-hidden="true" />
        <span>
          <span className="block text-[14px] font-medium text-ink">Paste a confirmation</span>
          <span className="block text-[12px] text-ink-soft">We read the details out</span>
        </span>
      </button>
      <button
        onClick={onManual}
        className="flex w-full items-start gap-3 border-t border-line px-4 py-3 text-left hover:bg-paper"
      >
        <i className="ti ti-pencil mt-0.5 text-[18px] text-ink-soft" aria-hidden="true" />
        <span>
          <span className="block text-[14px] font-medium text-ink">Enter manually</span>
          <span className="block text-[12px] text-ink-soft">Type it in yourself</span>
        </span>
      </button>
    </div>
  );
}
