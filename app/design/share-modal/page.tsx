import { getSupabase, rowToBooking, TABLE, type BookingRow } from "@/lib/supabase";
import { CATEGORY_META, type Booking } from "@/lib/types";
import { tripDays } from "@/lib/agenda";

export const dynamic = "force-dynamic";

const SAMPLE_NAME = "Canada Sep";
const LINK = "uselineup.vercel.app/share/9f1a…";

async function getTrip(): Promise<Booking[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from(TABLE)
    .select("*")
    .eq("trip_name", SAMPLE_NAME)
    .eq("status", "upcoming");
  const bookings = ((data as BookingRow[]) ?? []).map(rowToBooking);
  bookings.sort((a, b) => +new Date(a.eventAt) - +new Date(b.eventAt));
  return bookings;
}

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC", ...o });

function Shell({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-medium text-paper">
          {tag}
        </span>
        <span className="text-[13px] font-medium text-ink-soft">{title}</span>
      </div>
      <div className="flex justify-center rounded-2xl bg-ink/30 p-6">
        {children}
      </div>
    </div>
  );
}

const fieldCls =
  "min-w-0 flex-1 truncate rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-[12px] text-ink-soft";
const copyCls =
  "shrink-0 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper";

export default async function ShareModalDesign() {
  const bookings = await getTrip();
  const gaps = tripDays(bookings).filter((d) => d.gap);
  const hotels = bookings.filter((b) => b.category === "hotel").length;
  const flights = bookings.filter((b) => b.category === "flight").length;
  const range = bookings.length
    ? `${fmt(bookings[0].eventAt, { month: "short", day: "numeric" })} – ${fmt(
        bookings[bookings.length - 1].eventAt,
        { month: "short", day: "numeric", year: "numeric" },
      )}`
    : "";

  return (
    <main className="min-h-screen bg-paper px-5 py-10">
      <div className="mx-auto max-w-md space-y-10">
        <header>
          <h1 className="font-serif text-2xl text-ink">Share modal — options</h1>
          <p className="mt-1 text-[13px] text-ink-soft">
            Opens when you tap the share icon on a trip. Real {SAMPLE_NAME}{" "}
            data. Pick one and I&apos;ll wire it up.
          </p>
        </header>

        {/* A — Preview + link */}
        <Shell tag="A" title="Preview + link">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-raised p-5">
            <div className="mb-4 flex items-center">
              <span className="text-[15px] font-semibold text-ink">
                Share trip
              </span>
              <i
                className="ti ti-x ml-auto text-[18px] text-ink-faint"
                aria-hidden="true"
              />
            </div>
            <div className="mb-4 rounded-xl bg-paper p-4">
              <div className="font-serif text-lg text-ink">{SAMPLE_NAME}</div>
              <div className="mb-2.5 text-[12px] text-ink-faint">{range}</div>
              <div className="flex items-center gap-2 text-[13px] text-ink">
                <i
                  className="ti ti-circle-check text-[16px] text-ok"
                  aria-hidden="true"
                />
                {flights} flights, {hotels} hotels booked
              </div>
              {gaps.length > 0 && (
                <div className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-soft">
                  <i
                    className="ti ti-circle text-[16px] text-ink-faint"
                    aria-hidden="true"
                  />
                  {gaps.length} night{gaps.length === 1 ? "" : "s"} still to sort
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <span className={fieldCls}>{LINK}</span>
              <span className={copyCls}>Copy link</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[12px] text-accent">
              Open full preview
              <i className="ti ti-external-link text-[13px]" aria-hidden="true" />
            </div>
          </div>
        </Shell>

        {/* B — Minimal link */}
        <Shell tag="B" title="Minimal link">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-raised p-5">
            <div className="mb-3 flex items-center">
              <span className="text-[15px] font-semibold text-ink">
                Share {SAMPLE_NAME}
              </span>
              <i
                className="ti ti-x ml-auto text-[18px] text-ink-faint"
                aria-hidden="true"
              />
            </div>
            <p className="mb-3.5 text-[12px] text-ink-soft">
              Anyone with the link sees what&apos;s booked. No login needed.
            </p>
            <div className="flex gap-2">
              <span className={fieldCls}>{LINK}</span>
              <span className={copyCls}>Copy</span>
            </div>
          </div>
        </Shell>

        {/* C — Link + send to */}
        <Shell tag="C" title="Link + send to apps">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-raised p-5">
            <div className="mb-3.5 flex items-center">
              <span className="text-[15px] font-semibold text-ink">
                Share {SAMPLE_NAME}
              </span>
              <i
                className="ti ti-x ml-auto text-[18px] text-ink-faint"
                aria-hidden="true"
              />
            </div>
            <div className="mb-3.5 flex gap-2">
              <span className={fieldCls}>{LINK}</span>
              <span className={copyCls}>Copy</span>
            </div>
            <div className="flex gap-2">
              {[
                { icon: "ti-message", label: "Messages" },
                { icon: "ti-mail", label: "Email" },
                { icon: "ti-dots", label: "More" },
              ].map((c) => (
                <div
                  key={c.label}
                  className="flex flex-1 flex-col items-center gap-1.5 rounded-xl border border-line bg-paper py-3 text-[11px] text-ink-soft"
                >
                  <i className={`ti ${c.icon} text-[18px]`} aria-hidden="true" />
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        </Shell>
      </div>
    </main>
  );
}
