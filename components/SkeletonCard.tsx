// Loading placeholders mirroring the Upcoming layout (trip header + day agenda +
// desktop photo sidebar). The `sk` + `animate-shimmer` utilities give the
// sweeping shimmer (disabled under reduced-motion).
const block = "sk animate-shimmer motion-reduce:animate-none";

// One day's worth of the agenda: the date rail, the timeline dot, and a 2-line row.
function SkeletonDay() {
  return (
    <div className="flex gap-3.5">
      <div className="w-14 shrink-0 space-y-1.5 pt-0.5">
        <div className={`${block} ml-auto h-2.5 w-8 rounded`} />
        <div className={`${block} ml-auto h-3.5 w-9 rounded`} />
        <div className={`${block} ml-auto h-2.5 w-7 rounded`} />
      </div>
      <div className="relative flex w-3 shrink-0 justify-center">
        <div className="w-px bg-line" />
        <div className={`${block} absolute top-[7px] size-2.5 rounded-full`} />
      </div>
      <div className="min-w-0 flex-1 pb-5">
        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-raised px-3.5 py-3">
          <div className="flex items-center gap-3">
            <div className={`${block} size-9 shrink-0 rounded-lg`} />
            <div className={`${block} h-3.5 w-1/2 rounded`} />
            <div className={`${block} ml-auto h-3.5 w-12 shrink-0 rounded`} />
          </div>
          <div className="pl-12">
            <div className={`${block} h-2.5 w-20 rounded`} />
          </div>
        </div>
      </div>
    </div>
  );
}

// The desktop-only companion: photo + a couple of fact lines.
function SkeletonSidebar() {
  return (
    <div>
      <div className={`${block} aspect-[4/3] w-full rounded-2xl`} />
      <div className="mt-3 space-y-2 px-0.5">
        <div className={`${block} h-3.5 w-28 rounded`} />
        <div className={`${block} h-3 w-40 rounded`} />
        <div className={`${block} h-2.5 w-24 rounded`} />
      </div>
    </div>
  );
}

// Mirrors the Upcoming layout: trip sections divided by hairlines, each with a
// serif-title header, a day-by-day agenda, and the desktop photo sidebar.
export function SkeletonTrips() {
  return (
    <div className="divide-y divide-line">
      {[3, 2].map((days, gi) => (
        <section key={gi} className="py-7 first:pt-0 last:pb-0">
          <div className="flex items-start gap-3 px-1 pb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className={`${block} size-[18px] shrink-0 rounded-full`} />
                <div className={`${block} h-5 w-44 rounded`} />
              </div>
              <div className={`${block} ml-[26px] mt-2 h-3 w-32 rounded`} />
            </div>
            <div className={`${block} mt-1 size-6 shrink-0 rounded`} />
          </div>

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8">
            <div>
              {Array.from({ length: days }).map((_, i) => (
                <SkeletonDay key={i} />
              ))}
            </div>
            <div className="hidden lg:block">
              <SkeletonSidebar />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
