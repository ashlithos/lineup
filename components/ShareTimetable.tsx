import type { Booking } from "@/lib/types";
import { buildWeek, DAY_START, DAY_END, PLAN_END, dur, hhmm } from "@/lib/freetime";
import { cityLabel, sunTimes } from "@/lib/sun";
import { localDate } from "@/lib/localtime";
import { forecastForPlaces, weatherLook } from "@/lib/weather";

// The shared "when am I free" view. Read-only and server-rendered — no
// controls, and deliberately no hotel names, prices or confirmation details.
// A friend needs to see the shape of your days, not your reservations.

const SPAN = DAY_END - DAY_START;
const pct = (m: number) => ((m - DAY_START) / SPAN) * 100;

const TONE: Record<string, string> = {
  travel: "bg-line-strong text-ink",
  event: "bg-accent text-white",
  meal: "bg-ok-soft text-ok border border-ok/25",
  unknown: "bg-soon-soft text-soon border border-dashed border-soon/60",
};

const weekday = (iso: string) =>
  localDate(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dayNum = (iso: string) =>
  localDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const HOURS = Array.from({ length: Math.floor(SPAN / 120) + 1 }, (_, i) => DAY_START + i * 120);

export async function ShareTimetable({ bookings }: { bookings: Booking[] }) {
  const days = buildWeek(bookings, { meals: true });
  if (!days.length) return null;

  // Forecasts reach ~16 days out. Days past that get no weather line at all.
  const weather = await forecastForPlaces(
    days.map((d) => d.endPlace ?? d.place),
  );
  const weatherOn = (d: (typeof days)[number]) =>
    weather[d.endPlace ?? d.place ?? ""]?.get(d.date.slice(0, 10));

  const whereFor = (d: (typeof days)[number]) => {
    const from = cityLabel(d.place);
    const to = cityLabel(d.endPlace);
    return from && to && from !== to ? `${from} → ${to}` : (to ?? from);
  };

  return (
    <div>
      {/* ---------- phones: one row per day, easier to read than a squeezed grid ---------- */}
      <ul className="space-y-2.5 md:hidden">
        {days.map((d) => {
          const where = whereFor(d);
          const am = sunTimes(d.place, d.date);
          const pm = sunTimes(d.endPlace ?? d.place, d.date);
          return (
            <li key={d.key} className="rounded-xl border border-line bg-paper p-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[15px] font-semibold text-ink">
                  {weekday(d.date)} {dayNum(d.date)}
                </span>
                {where && <span className="text-[13px] text-ink-soft">{where}</span>}
                {(() => {
                  const w = weatherOn(d);
                  if (!w) return null;
                  const look = weatherLook(w.code);
                  return (
                    <span className="text-[13px] text-ink-soft">
                      <span aria-hidden="true">{look.icon}</span>{" "}
                      <span className="font-mono">{w.high}°/{w.low}°</span>
                      <span className="sr-only">
                        {look.label}, high {w.high} degrees, low {w.low}
                      </span>
                    </span>
                  );
                })()}
                <span className="ml-auto text-[13px] font-medium text-ink">
                  {d.freeMinutes > 0 ? `${dur(d.freeMinutes)} free` : "fully booked"}
                </span>
              </div>

              {/* A single horizontal bar reads well at 375px. */}
              <div className="relative mt-2.5 h-8 overflow-hidden rounded-lg border border-line bg-raised">
                {am && pm && (
                  <>
                    <span className="absolute inset-y-0 left-0 bg-ink/[0.045]" style={{ width: `${pct(Math.max(DAY_START, am.sunrise))}%` }} aria-hidden="true" />
                    <span className="absolute inset-y-0 right-0 bg-ink/[0.045]" style={{ left: `${pct(Math.min(DAY_END, pm.sunset))}%` }} aria-hidden="true" />
                  </>
                )}
                <span className="absolute inset-y-0 right-0 bg-line/50" style={{ left: `${pct(PLAN_END)}%` }} aria-hidden="true" />
                {d.blocks.map((b) => (
                  <span
                    key={b.key}
                    className={`absolute inset-y-0.5 flex items-center justify-center overflow-hidden rounded px-1 text-[10px] font-medium ${TONE[b.kind]}`}
                    style={{ left: `${pct(b.start)}%`, width: `${Math.max(pct(b.end) - pct(b.start), 3)}%` }}
                  >
                    {b.kind === "meal" ? "" : b.label.split(" ")[0]}
                  </span>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.free.map((f) => (
                  <span key={f.key} className="rounded-full border border-line bg-raised px-2.5 py-1 text-[12px] text-ink-soft">
                    {hhmm(f.start)}–{hhmm(f.end)}
                    <span className="ml-1.5 font-medium text-ink">{dur(f.end - f.start)}</span>
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {/* ---------- tablets and up: the full week ---------- */}
      <div className="hidden md:block">
        <div className="overflow-x-auto pb-1">
          <div
            className="grid min-w-[720px] gap-1.5"
            style={{ gridTemplateColumns: `38px repeat(${days.length}, minmax(96px, 1fr))` }}
          >
            <div />
            {days.map((d) => {
              const where = whereFor(d);
              return (
                <div key={`h-${d.key}`} className="pb-1 text-center">
                  <div className="text-[13px] font-semibold text-ink">{weekday(d.date)}</div>
                  <div className="text-[11px] text-ink-faint">{dayNum(d.date)}</div>
                  {where && (
                    <div className="mt-0.5 text-[10.5px] leading-tight text-ink-soft">
                      {where}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="relative h-[300px]">
              {HOURS.map((h) => (
                <span key={h} className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-ink-faint" style={{ top: `${pct(h)}%` }}>
                  {hhmm(h)}
                </span>
              ))}
            </div>

            {days.map((d) => {
              const am = sunTimes(d.place, d.date);
              const pm = sunTimes(d.endPlace ?? d.place, d.date);
              return (
                <div key={d.key} className="relative h-[300px] overflow-hidden rounded-lg border border-line bg-raised">
                  {am && pm && (
                    <>
                      <span className="absolute inset-x-0 top-0 bg-ink/[0.045]" style={{ height: `${pct(Math.max(DAY_START, am.sunrise))}%` }} aria-hidden="true" />
                      <span className="absolute inset-x-0 bottom-0 bg-ink/[0.045]" style={{ top: `${pct(Math.min(DAY_END, pm.sunset))}%` }} aria-hidden="true" />
                    </>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-line/50" style={{ top: `${pct(PLAN_END)}%` }} aria-hidden="true" />
                  {HOURS.map((h) => (
                    <span key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: `${pct(h)}%` }} aria-hidden="true" />
                  ))}
                  {d.blocks.map((b) => {
                    const top = pct(b.start);
                    const height = Math.max(pct(b.end) - top, 4);
                    return (
                      <span
                        key={b.key}
                        className={`absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-[10px] ${TONE[b.kind]}`}
                        style={{ top: `${top}%`, height: `${height}%` }}
                      >
                        <span className="block truncate font-medium leading-tight">{b.label}</span>
                        {height > 11 && (
                          <span className="block truncate opacity-85">
                            {hhmm(b.start)}
                            {b.kind !== "unknown" && `–${hhmm(b.end)}`}
                          </span>
                        )}
                      </span>
                    );
                  })}
                  {d.free.map((f) => {
                    const h = pct(f.end) - pct(f.start);
                    if (h < 9) return null;
                    return (
                      <span
                        key={f.key}
                        className="pointer-events-none absolute inset-x-0 flex items-center justify-center text-[10px] font-semibold text-ink-soft"
                        style={{ top: `${pct(f.start)}%`, height: `${h}%` }}
                      >
                        {dur(f.end - f.start)} free
                      </span>
                    );
                  })}
                </div>
              );
            })}

            <div className="pt-1.5 text-right font-mono text-[10px] text-ink-faint">free</div>
            {days.map((d) => (
              <div key={`t-${d.key}`} className="pt-1.5 text-center font-mono text-[12px] font-medium text-ink">
                {dur(d.freeMinutes)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        {[
          ["bg-raised border border-line", "free"],
          ["bg-line-strong", "travelling"],
          ["bg-accent", "booked"],
          ["bg-ok-soft border border-ok/25", "meals"],
          ["bg-ink/[0.045] border border-line", "after dark"],
        ].map(([c, label]) => (
          <span key={label} className="flex items-center gap-1.5 text-[12px] text-ink-soft">
            <span className={`size-3 rounded-[3px] ${c}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
