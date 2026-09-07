"use client";

import { CATEGORY_META, CATEGORY_ORDER, type Category } from "@/lib/types";

export type TypeFilterValue = Category | "all";

export function TypeFilter({
  value,
  onChange,
  available,
}: {
  value: TypeFilterValue;
  onChange: (v: TypeFilterValue) => void;
  available: Category[];
}) {
  const cats = CATEGORY_ORDER.filter((c) => available.includes(c));

  const chip = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
      active
        ? "border-ink bg-ink text-paper"
        : "border-line bg-raised text-ink-soft hover:border-line-strong"
    }`;

  return (
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:justify-end md:overflow-visible md:px-0 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button className={chip(value === "all")} onClick={() => onChange("all")}>
        All types
      </button>
      {cats.map((c) => (
        <button
          key={c}
          className={chip(value === c)}
          onClick={() => onChange(c)}
        >
          <span>{CATEGORY_META[c].emoji}</span>
          {CATEGORY_META[c].plural}
        </button>
      ))}
    </div>
  );
}
