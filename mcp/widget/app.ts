// Lineup's widget inside Claude: the cancel-by radar (lineup_attention) and
// the plans view with list · cards · timetable · year (lineup_plans). One
// bundle serves both; the tool result's `kind` picks the screen.
//
// Built into a self-contained HTML string by scripts/build-mcp-widget.mjs.
// Booking text is always written with textContent, never innerHTML.

import { App } from "@modelcontextprotocol/ext-apps/app-with-deps";
import type { Plans, Radar, RadarRow } from "@/lib/mcp/data";

type Result = ({ kind: "radar" } & Radar) | ({ kind: "plans" } & Plans);

const app = new App({ name: "Lineup", version: "1.0.0" });
const root = document.getElementById("root")!;

let result: Result | null = null;
let view: Plans["view"] = "list";
const kept = new Map<string, boolean>();
const cancelled = new Set<string>();
let confirming: string | null = null;
// The top card is chosen once per answer, so tapping Keep confirms in place
// instead of sliding the booking into the list below.
let heroId: string | null = null;
let toast: { text: string; undo?: () => void } | null = null;

type Child = Node | string | null | undefined | false;
function el(tag: string, attrs: Record<string, string | ((e: Event) => void)> = {}, ...kids: Child[]): HTMLElement {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "function") n.addEventListener(k, v);
    else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null && c !== false) n.append(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
}

async function call(name: string, args: Record<string, unknown>) {
  const res = await app.callServerTool({ name, arguments: args });
  if (res.isError) throw new Error("save failed");
}

function tell(text: string) {
  void app.updateModelContext({ content: [{ type: "text", text }] });
}

// ── Radar ──────────────────────────────────────────────────────────────────

const isKept = (r: RadarRow) => kept.get(r.id) ?? r.kept;

async function setKept(r: RadarRow, value: boolean) {
  kept.set(r.id, value);
  render();
  try {
    await call("lineup_set_kept", { id: r.id, kept: value });
    tell(`User marked "${r.title}" as ${value ? "kept (reminders off)" : "not kept"} in Lineup.`);
  } catch {
    kept.set(r.id, !value);
    toast = { text: "Couldn't save that. Try again in a moment." };
    render();
  }
}

async function setCancelled(r: RadarRow, value: boolean) {
  try {
    await call("lineup_set_status", { id: r.id, status: value ? "cancelled" : "upcoming" });
    if (value) cancelled.add(r.id);
    else cancelled.delete(r.id);
    confirming = null;
    toast = value ? { text: `Marked cancelled: ${r.title}`, undo: () => void setCancelled(r, false) } : null;
    tell(`User marked "${r.title}" as ${value ? "cancelled" : "upcoming again"} in Lineup.`);
  } catch {
    toast = { text: "Couldn't save that. Try again in a moment." };
  }
  render();
}

function startCancel(r: RadarRow) {
  if (r.cancelUrl) void app.openLink({ url: r.cancelUrl });
  confirming = r.id;
  toast = null;
  render();
}

function confirmBox(r: RadarRow): HTMLElement {
  return el(
    "div",
    { class: "confirm" },
    el("span", {}, r.cancelUrl ? `Opened ${r.vendor ?? "the booking site"}. Did you cancel it?` : "Did you cancel it with the vendor?"),
    el(
      "div",
      { class: "btns" },
      el("button", { class: "btn ink", click: () => void setCancelled(r, true) }, "Yes, mark cancelled"),
      el("button", { class: "btn", click: () => { confirming = null; render(); } }, "Not yet"),
    ),
  );
}

function hero(r: RadarRow): HTMLElement {
  const isKeptNow = isKept(r);
  return el(
    "div",
    { class: `hero ${r.urgency}` },
    el("div", { class: "eyebrow" }, el("span", { class: "dot" }), r.urgency === "urgent" ? "Decide soon" : "Next deadline"),
    el("div", { class: "hero-title" }, el("span", { class: "emoji", "aria-hidden": "true" }, r.emoji), el("h2", {}, r.title)),
    el("p", { class: "big mono" }, `${r.left} left`),
    el("p", { class: "sub" }, `to cancel for free · by ${r.deadline}${r.amount ? ` · ${r.amount} back` : ""}`),
    confirming === r.id
      ? confirmBox(r)
      : isKeptNow
        ? el(
            "div",
            { class: "note ok" },
            el("span", {}, "Kept. Reminders for this one are off."),
            el("button", { class: "link", click: () => void setKept(r, false) }, "Undo"),
          )
        : el(
            "div",
            { class: "btns" },
            el("button", { class: "btn accent", click: () => void setKept(r, true) }, "Keep it"),
            el("button", { class: "btn danger", click: () => startCancel(r) }, "Cancel it"),
          ),
  );
}

function row(r: RadarRow): HTMLElement {
  const k = isKept(r);
  return el(
    "div",
    { class: "row" },
    el("span", { class: "tile", "aria-hidden": "true" }, r.emoji),
    el(
      "div",
      { class: "grow" },
      el("div", { class: "title" }, r.title),
      el("div", { class: "meta" }, el("b", { class: `tone-${r.urgency}` }, r.left), ` · ${[r.vendor, r.amount].filter(Boolean).join(" · ")}`),
      confirming === r.id ? confirmBox(r) : null,
    ),
    el(
      "div",
      { class: "chips" },
      el("button", { class: `chip${k ? " on" : ""}`, "aria-pressed": String(k), click: () => void setKept(r, !k) }, k ? "Kept" : "Keep"),
      el("button", { class: "chip", "aria-label": `Cancel ${r.title}`, click: () => startCancel(r) }, "Cancel"),
    ),
  );
}

function renderRadar(r: Radar): HTMLElement {
  const rows = r.rows.filter((x) => !cancelled.has(x.id));
  const first = rows.find((x) => x.id === heroId) ?? null;
  const rest = rows.filter((x) => x !== first);
  return el(
    "div",
    { class: "widget" },
    el(
      "div",
      { class: "head" },
      el("div", { class: "brand" }, el("span", { class: "dot" }), "Lineup · Cancel-by radar"),
      r.atStake ? el("span", { class: "mono muted" }, `${r.atStake} at stake`) : null,
    ),
    rows.length === 0 ? el("p", { class: "muted pad" }, "Nothing to decide. No free-cancellation windows are open.") : null,
    first ? hero(first) : null,
    rest.length ? el("div", { class: "list" }, ...rest.map(row)) : null,
    r.noDeadline.length
      ? el("p", { class: "muted small pad" }, `No cancel-by date noted for ${r.noDeadline.join(", ")}.`)
      : null,
  );
}

// ── Plans ──────────────────────────────────────────────────────────────────

const TABS: [Plans["view"], string][] = [
  ["list", "List"],
  ["cards", "Cards"],
  ["timetable", "Timetable"],
  ["year", "Year"],
];

function tabs(p: Plans): HTMLElement {
  return el(
    "div",
    { class: "tabs", role: "tablist", "aria-label": "Lineup view" },
    ...TABS.map(([id, label]) => {
      const disabled = id === "timetable" && !p.timetable;
      return el(
        "button",
        {
          role: "tab",
          class: `tab${view === id ? " on" : ""}`,
          "aria-selected": String(view === id),
          ...(disabled ? { disabled: "", title: "No trip with travel in this range" } : {}),
          click: () => { view = id; render(); },
        },
        label,
      );
    }),
  );
}

function listView(p: Plans): HTMLElement {
  return el(
    "div",
    { class: "list" },
    ...p.items.map((i) =>
      el(
        "div",
        { class: "row" },
        el("span", { class: "day" }, i.day),
        el("div", { class: "grow" }, el("div", { class: "title" }, i.title), el("div", { class: "meta" }, i.meta)),
        el("span", { class: `tag tone-${i.tone}` }, i.tag),
      ),
    ),
  );
}

function cardsView(p: Plans): HTMLElement {
  return el(
    "div",
    { class: "cards" },
    ...p.items.map((i) =>
      el(
        "div",
        { class: "card" },
        el("span", { class: "mono muted small" }, i.day),
        el("span", { class: "card-title" }, el("span", { "aria-hidden": "true" }, `${i.emoji} `), i.title),
        el("span", { class: "meta" }, i.meta),
        el("span", { class: `tag tone-${i.tone}` }, i.tag),
      ),
    ),
  );
}

const START = 7 * 60;
const END = 23 * 60;
const PX = 0.36; // px per minute: 16 hours ≈ 346px

function timetableView(p: Plans): HTMLElement {
  const t = p.timetable;
  if (!t) return el("p", { class: "muted pad" }, "No trip with travel in this range.");
  const hours = [];
  for (let m = START; m <= END; m += 120) {
    const h = m / 60;
    hours.push(el("div", { class: "hour", style: `top:${(m - START) * PX}px` }, el("span", { class: "mono" }, `${h % 12 || 12}${h < 12 ? "a" : "p"}`)));
  }
  const cols = t.days.map((d) =>
    el(
      "div",
      { class: "col" },
      el("div", { class: "col-head" }, el("b", {}, d.label), d.place ? el("span", { class: "muted small place" }, d.place) : null),
      el(
        "div",
        { class: "col-body", style: `height:${(END - START) * PX}px` },
        ...d.blocks.map((b) => {
          const top = Math.max(0, (b.start - START) * PX);
          const height = Math.max(16, (Math.min(b.end, END) - Math.max(b.start, START)) * PX);
          return el(
            "div",
            {
              class: `block k-${b.kind}${height < 30 ? " short" : ""}`,
              style: `top:${top}px;height:${height}px`,
              title: `${b.time} ${b.label}`,
            },
            el("b", {}, b.label),
            el("span", { class: "mono" }, b.time),
          );
        }),
      ),
    ),
  );
  return el(
    "div",
    { class: "tt" },
    el("div", { class: "muted small" }, t.trip),
    el(
      "div",
      { class: "tt-scroll" },
      el("div", { class: "tt-grid" }, el("div", { class: "gutter", style: `height:${(END - START) * PX}px` }, ...hours), ...cols),
    ),
    el("div", { class: "legend" }, el("span", { class: "sw booked" }), "Booked", el("span", { class: "sw tobook" }), "To book"),
  );
}

function shade(n: number): string {
  if (n === 0) return "d0";
  if (n <= 2) return "d1";
  if (n <= 4) return "d2";
  return "d3";
}

function yearView(p: Plans): HTMLElement {
  const grid = `grid-template-columns:44px repeat(${p.year.buckets.length}, minmax(0,1fr))`;
  return el(
    "div",
    { class: "year" },
    el("div", { class: "yr head-row", style: grid }, el("span"), ...p.year.buckets.map((b) => el("span", { class: "mono" }, b))),
    ...p.year.months.map((m) =>
      el(
        "div",
        { class: "yr", style: grid },
        el("b", {}, m.label),
        ...m.weeks.map((n) => el("span", { class: `cell ${shade(n)}`, title: `${n} busy day${n === 1 ? "" : "s"}` }, n ? String(n) : "")),
      ),
    ),
    el("div", { class: "muted small" }, "Busy days per stretch of the month."),
  );
}

function renderPlans(p: Plans): HTMLElement {
  const body =
    view === "cards" ? cardsView(p) : view === "timetable" ? timetableView(p) : view === "year" ? yearView(p) : listView(p);
  return el(
    "div",
    { class: "widget" },
    el(
      "div",
      { class: "head" },
      el(
        "div",
        {},
        el("div", { class: "brand" }, p.label),
        el("div", { class: "muted small" }, `${p.counts.booked} booked · ${p.counts.toBook} to book`),
      ),
      p.total ? el("span", { class: "mono muted" }, p.total) : null,
    ),
    tabs(p),
    p.items.length || view === "year" ? body : el("p", { class: "muted pad" }, "Nothing booked in this range."),
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────

function render() {
  if (!result) {
    root.replaceChildren(el("div", { class: "widget muted" }, "Opening Lineup…"));
    return;
  }
  const screen = result.kind === "radar" ? renderRadar(result) : renderPlans(result);
  if (toast) {
    screen.append(
      el(
        "div",
        { class: "toast", role: "status" },
        el("span", {}, toast.text),
        toast.undo ? el("button", { class: "link light", click: toast.undo }, "Undo") : null,
      ),
    );
  }
  root.replaceChildren(screen);
}

app.ontoolresult = (params) => {
  const data = params.structuredContent as Result | undefined;
  // Only a radar or plans result redraws the view; a Keep/Cancel update
  // ({ id, kept, status }) must not replace it.
  if (data?.kind !== "radar" && data?.kind !== "plans") return;
  result = data;
  if (result?.kind === "plans") view = result.view;
  heroId = result?.kind === "radar" ? (result.rows.find((x) => !x.kept) ?? result.rows[0])?.id ?? null : null;
  kept.clear();
  cancelled.clear();
  confirming = null;
  toast = null;
  render();
};
app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) document.documentElement.dataset.theme = ctx.theme;
};

render();
app.connect().then(() => {
  const theme = app.getHostContext()?.theme;
  if (theme) document.documentElement.dataset.theme = theme;
});
