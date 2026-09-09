"use client";

import { useEffect, useMemo, useState } from "react";
import type { Booking, Category } from "@/lib/types";
import { useBookings } from "@/lib/store";
import { sampleBookings } from "@/lib/sample";
import { scanInbox, type Candidate } from "@/lib/extract";
import { buildTrips, type Trip } from "@/lib/trips";
import { BookingCard, GroupedBookingCard } from "@/components/BookingCard";
import { collapseFlights, isFlightGroup } from "@/lib/flights";
import { YearDensity } from "@/components/YearDensity";
import { touchesRange } from "@/lib/density";
import { PlanCheckSheet } from "@/components/PlanCheckSheet";
import { TripAgenda } from "@/components/TripAgenda";
import { WeekGrid } from "@/components/WeekGrid";
import { ToBookList } from "@/components/ToBookList";
import { TripSidebar } from "@/components/TripSidebar";
import { PlanCard } from "@/components/PlanCard";
import { TripPlanCard } from "@/components/TripPlanCard";
import { PlanDialog } from "@/components/PlanDialog";
import { ShareModal } from "@/components/ShareModal";
import { AssignDialog } from "@/components/AssignDialog";
import { TypeFilter, type TypeFilterValue } from "@/components/TypeFilter";
import { AddBookingDialog } from "@/components/AddBookingDialog";
import { ReviewSheet } from "@/components/ReviewSheet";
import { PasteDialog } from "@/components/PasteDialog";
import { SkeletonTrips } from "@/components/SkeletonCard";
import { AddMenu } from "@/components/AddMenu";

type Rail = "forward" | "plan" | "past";
type Draft = Omit<Booking, "id" | "createdAt" | "status">;

export default function Home() {
  const { bookings, ready, add, update, remove, replaceAll, refresh } =
    useBookings();
  const [refreshing, setRefreshing] = useState(false);
  const [rail, setRail] = useState<Rail>("forward");
  const [filter, setFilter] = useState<TypeFilterValue>("all");
  const [planYear, setPlanYear] = useState<string>("all"); // "all" | "YYYY"
  const [weekFilter, setWeekFilter] = useState<number | null>(null); // Monday ms
  const [planCheckOpen, setPlanCheckOpen] = useState(false);
  const [shareTripObj, setShareTripObj] = useState<Trip | null>(null);
  // The "still to book" items being handed to someone else.
  const [assigning, setAssigning] = useState<Booking[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [addPrefill, setAddPrefill] = useState<Partial<Booking> | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Booking | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [gmail, setGmail] = useState<{
    configured: boolean;
    connected: boolean;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [collapsedTrips, setCollapsedTrips] = useState<Set<string>>(new Set());
  // Which lens each trip is showing: the chapters, or the free-time grid.
  const [freeTimeTrips, setFreeTimeTrips] = useState<Set<string>>(new Set());
  const [editingTrip, setEditingTrip] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Gmail connection state + one-time redirect feedback after OAuth.
  useEffect(() => {
    fetch("/api/gmail/status")
      .then((r) => r.json())
      .then(setGmail)
      .catch(() => setGmail({ configured: false, connected: false }));
    const p = new URLSearchParams(window.location.search);
    const g = p.get("gmail");
    if (g === "connected") {
      setFlash("Gmail connected — hit Scan inbox to pull new bookings.");
      setTimeout(() => setFlash(null), 4000);
      window.history.replaceState({}, "", "/");
    } else if (g === "error") {
      setFlash("Couldn't connect Gmail. Try again.");
      setTimeout(() => setFlash(null), 4000);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // "tobook" items live inside a booked trip, so they travel with it on the
  // Upcoming rail rather than being filed away somewhere separate.
  const upcoming = useMemo(
    () => bookings.filter((b) => b.status === "upcoming" || b.status === "tobook"),
    [bookings],
  );

  // Want-to-book items — not booked yet. Newest first.
  const planBase = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "plan")
        .sort(
          (a, b) =>
            new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime(),
        ),
    [bookings],
  );

  const forwardBase = useMemo(
    () =>
      upcoming
        .filter((b) => new Date(b.eventAt).getTime() >= now)
        .sort(
          (a, b) =>
            new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime(),
        ),
    [upcoming, now],
  );

  // Past events from the last 30 days, most recent first.
  const pastBase = useMemo(() => {
    const cutoff = now - 30 * 24 * 3600 * 1000;
    return upcoming
      .filter((b) => {
        const t = new Date(b.eventAt).getTime();
        return t < now && t >= cutoff;
      })
      .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());
  }, [upcoming, now]);

  const base =
    rail === "forward" ? forwardBase : rail === "plan" ? planBase : pastBase;
  const availableCats = useMemo(
    () => Array.from(new Set(base.map((b) => b.category))) as Category[],
    [base],
  );

  // Year chips for the Plan rail — derived from items that have a real date (not sentinel 9999).
  const planYears = useMemo(
    () =>
      Array.from(
        new Set(
          planBase
            .filter((b) => !b.eventAt.startsWith("9999"))
            .map((b) => b.eventAt.slice(0, 4)),
        ),
      ).sort(),
    [planBase],
  );

  const items = useMemo(() => {
    const byType = filter === "all" ? base : base.filter((b) => b.category === filter);
    if (rail !== "plan" || planYear === "all") return byType;
    return byType.filter((b) => b.eventAt.slice(0, 4) === planYear);
  }, [base, filter, rail, planYear]);
  // Plan tab splits into trip containers (top tier) and single to-book items.
  const planTrips = useMemo(
    () => items.filter((b) => b.category === "trip"),
    [items],
  );
  const planSingles = useMemo(
    () => items.filter((b) => b.category !== "trip"),
    [items],
  );
  // Clicking a week in the density strip narrows the list to that week. The
  // strip itself keeps seeing every booking, so it doesn't collapse as you filter.
  const weekItems = useMemo(() => {
    if (weekFilter === null) return items;
    // Buckets are at most 7 days; the last one can run to day 31.
    return items.filter((b) => touchesRange(b, weekFilter, weekFilter + 8 * 86_400_000));
  }, [items, weekFilter]);
  // Upcoming tab groups bookings into auto-detected trips.
  const trips = useMemo(() => buildTrips(weekItems), [weekItems]);
  const toggleTrip = (key: string) =>
    setCollapsedTrips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const startRename = (trip: Trip) => {
    setEditingTrip(trip.key);
    setEditName(trip.custom ? trip.label : "");
  };
  const saveRename = (trip: Trip) => {
    const clean = editName.trim();
    trip.bookings.forEach((b) =>
      update(b.id, { tripName: clean || undefined }),
    );
    setEditingTrip(null);
  };
  // Custom trip photo — empty string clears it back to the stock image.
  const setTripImage = (trip: Trip, url: string | undefined) => {
    trip.bookings.forEach((b) => update(b.id, { imageUrl: url ?? "" }));
  };

  // Open the share modal for a real (booked) trip. Stamp the trip name onto
  // every booking first so the share link (which regroups by name) captures
  // auto-clustered members too.
  const openShare = (trip: Trip) => {
    trip.bookings.forEach((b) => {
      if (b.tripName !== trip.label) update(b.id, { tripName: trip.label });
    });
    setShareTripObj(trip);
  };

  const hasDemo = bookings.some((b) => b.isDemo);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setTimeout(() => setRefreshing(false), 400);
  };
  const openAdd = () => {
    setEditing(null);
    setAddPrefill(null);
    setDialogOpen(true);
  };
  // Gap row in the day agenda → open the add form prefilled for that night.
  const handleAddStay = (dateISO: string) => {
    setEditing(null);
    setAddPrefill({ category: "hotel", eventAt: dateISO });
    setDialogOpen(true);
  };
  const openMenuPaste = () => {
    setAddMenuOpen(false);
    setPasteOpen(true);
  };
  const openMenuManual = () => {
    setAddMenuOpen(false);
    openAdd();
  };
  const handleScan = async () => {
    setAddMenuOpen(false);
    // No Gmail wired up → fall back to the sample-inbox review flow.
    if (!gmail?.configured) {
      const seen = new Set(
        bookings.map((b) => b.cancelUrl || b.title.toLowerCase().trim()),
      );
      const found = scanInbox().filter(
        (c) =>
          !seen.has(c.draft.cancelUrl || c.draft.title.toLowerCase().trim()),
      );
      if (found.length === 0) {
        setFlash("You're all caught up — no new bookings in your inbox.");
        setTimeout(() => setFlash(null), 3500);
        return;
      }
      setCandidates(found);
      setReviewOpen(true);
      return;
    }
    // Not connected yet → start the Google sign-in.
    if (!gmail.connected) {
      window.location.href = "/api/gmail/connect";
      return;
    }
    // Live scan.
    setScanning(true);
    setFlash("Scanning your inbox…");
    try {
      const r = await fetch("/api/scan", { method: "POST" });
      const d = (await r.json()) as { added?: string[]; error?: string };
      // Token expired/revoked (Google drops them weekly for unverified apps) —
      // bounce straight into the reconnect flow instead of failing silently.
      if (d.error === "reconnect" || d.error === "not-connected") {
        setFlash("Reconnecting Gmail…");
        window.location.href = "/api/gmail/connect";
        return;
      }
      if (d.added?.length) {
        setFlash(`Added ${d.added.length}: ${d.added.join(", ")}`);
        await refresh();
      } else {
        setFlash("No new bookings found.");
      }
    } catch {
      setFlash("Scan failed — try again.");
    } finally {
      setScanning(false);
      setTimeout(() => setFlash(null), 5000);
    }
  };
  const handleConfirmReview = (drafts: Draft[]) => {
    drafts.forEach((d) => add(d));
    setReviewOpen(false);
  };
  // Ticking a "to book" item promotes it to a real booking. Everything it was
  // missing (price, confirmation, deadline) stays empty until an email fills it.
  const markBooked = (b: Booking) => update(b.id, { status: "upcoming" });

  // Handing items over records who was asked and where, so the daily reminder
  // can chase the same person if they're still not booked by their book-by date.
  const markAssigned = (ids: string[], who: string, email: string) => {
    const assignedAt = new Date().toISOString();
    ids.forEach((id) =>
      update(id, {
        assignee: who || undefined,
        assigneeEmail: email || undefined,
        assignedAt,
      }),
    );
    setFlash(
      who
        ? `Handed ${ids.length} to ${who}`
        : `Handed ${ids.length} over`,
    );
    setTimeout(() => setFlash(null), 2400);
  };

  const openEdit = (b: Booking) => {
    setEditing(b);
    setAddPrefill(null);
    setDialogOpen(true);
  };
  const handleSave = (draft: Draft, id: string | null) => {
    if (id) {
      // Saving a plan in the full booking form promotes it to upcoming.
      const wasPlan = bookings.find((x) => x.id === id)?.status === "plan";
      if (wasPlan) {
        update(id, { ...draft, status: "upcoming" });
        setRail("forward");
      } else {
        update(id, draft);
      }
    } else {
      add(draft);
    }
    setDialogOpen(false);
  };

  // Plan rail handlers.
  const openAddPlan = () => {
    setEditingPlan(null);
    setPlanDialogOpen(true);
  };
  const openEditPlan = (b: Booking) => {
    setEditingPlan(b);
    setPlanDialogOpen(true);
  };
  const handleSavePlan = (draft: Draft, id: string | null) => {
    if (id) update(id, draft);
    else add({ ...draft, status: "plan" });
    setPlanDialogOpen(false);
  };
  const handleDeletePlan = (id: string) => {
    remove(id);
    setPlanDialogOpen(false);
  };
  // "Booked it" → open the full booking form; saving it promotes the plan.
  const handleBooked = (b: Booking) => openEdit(b);

  return (
    <div className="mx-auto min-h-full w-full max-w-md px-5 pb-28 pt-8 md:max-w-3xl md:px-6 md:pt-10 lg:max-w-6xl lg:px-8 lg:pt-12 xl:max-w-7xl 2xl:px-12">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-semibold leading-none tracking-tight text-ink">
            LineUp
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">
            Everything you&apos;re looking forward to
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden md:block">
            <button
              onClick={() => setAddMenuOpen((v) => !v)}
              aria-label="Add a booking"
              aria-expanded={addMenuOpen}
              className="flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[14px] font-medium text-white transition-all hover:opacity-95 active:scale-[0.97]"
            >
              <i
                className={`ti ${addMenuOpen ? "ti-x" : "ti-plus"} text-base leading-none`}
                aria-hidden="true"
              />
              Add a booking
            </button>
            {addMenuOpen && (
              <div className="absolute right-0 z-40 mt-2">
                <AddMenu
                  onScan={handleScan}
                  onPaste={openMenuPaste}
                  onManual={openMenuManual}
                />
              </div>
            )}
          </div>
          <button
            onClick={handleRefresh}
            aria-label="Refresh"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-raised text-ink-soft transition-colors hover:border-line-strong hover:text-ink active:scale-95"
          >
            <i
              className={`ti ti-refresh text-[18px] leading-none ${refreshing || scanning ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </header>

      {flash && (
        <div className="mt-5 rounded-xl border border-ok/30 bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">
          {flash}
        </div>
      )}

      {hasDemo && (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-soon/30 bg-soon-soft px-3.5 py-2.5">
          <span className="text-[12px] text-soon">
            Showing sample data — not real bookings.
          </span>
          <button
            onClick={() => replaceAll(bookings.filter((b) => !b.isDemo))}
            className="shrink-0 text-[12px] font-medium text-soon underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="flex w-full gap-1 rounded-xl border border-line bg-raised p-1 md:w-96">
        {(
          [
            ["forward", "Upcoming"],
            ["plan", "Plan"],
            ["past", "Past"],
          ] as [Rail, string][]
        ).map(([key, lbl]) => (
          <button
            key={key}
            onClick={() => setRail(key)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${
              rail === key ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
      {ready && rail === "plan" && planYears.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 md:pt-1">
          <button
            onClick={() => setPlanYear("all")}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              planYear === "all"
                ? "bg-ink text-paper"
                : "border border-line text-ink-soft hover:border-line-strong hover:text-ink"
            }`}
          >
            All
          </button>
          {planYears.map((y) => (
            <button
              key={y}
              onClick={() => setPlanYear(y)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                planYear === y
                  ? "bg-ink text-paper"
                  : "border border-line text-ink-soft hover:border-line-strong hover:text-ink"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}
      {ready && rail !== "plan" && availableCats.length > 1 && (
        <div className="md:min-w-0 md:pt-1">
          <TypeFilter
            value={filter}
            onChange={setFilter}
            available={availableCats}
          />
        </div>
      )}
      </div>

      <div className="mt-5">
        {!ready ? (
          <SkeletonTrips />
        ) : rail === "plan" ? (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[13px] text-ink-soft">
                Things you want to book — not booked yet.
              </p>
              <button
                onClick={openAddPlan}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-raised px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:border-line-strong"
              >
                <i className="ti ti-plus text-[15px]" aria-hidden="true" /> Add to
                plan
              </button>
            </div>
            {items.length === 0 ? (
              <PlanEmpty onAdd={openAddPlan} />
            ) : (
              <div className="space-y-8">
                {planTrips.length > 0 && (
                  <section>
                    <div className="mb-3 flex items-baseline gap-2 px-1">
                      <h2 className="font-serif text-xl text-ink">Trips to plan</h2>
                      <span className="text-[12px] text-ink-faint">
                        {planTrips.length} · nothing booked yet
                      </span>
                    </div>
                    <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4 2xl:grid-cols-4">
                      {planTrips.map((p) => (
                        <TripPlanCard key={p.id} plan={p} onOpen={openEditPlan} />
                      ))}
                    </div>
                  </section>
                )}
                {planSingles.length > 0 && (
                  <section>
                    <div className="mb-3 flex items-baseline gap-2 px-1">
                      <h2 className="font-serif text-xl text-ink">Things to book</h2>
                      <span className="text-[12px] text-ink-faint">
                        {planSingles.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4 2xl:grid-cols-4">
                      {planSingles.map((p) => (
                        <PlanCard
                          key={p.id}
                          plan={p}
                          onOpen={openEditPlan}
                          onBooked={handleBooked}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        ) : bookings.length === 0 ? (
          <FirstRun
            onScan={handleScan}
            onAdd={openAdd}
            onSample={() => replaceAll(sampleBookings())}
          />
        ) : items.length === 0 ? (
          <RailEmpty rail={rail} filtered={filter !== "all"} />
        ) : rail === "forward" ? (
          <div>
            {filter === "all" && (
              <div className="mb-7 space-y-3">
                <YearDensity
                  bookings={items}
                  selectedWeek={weekFilter}
                  onSelectWeek={setWeekFilter}
                />
                <button
                  onClick={() => setPlanCheckOpen(true)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-raised px-4 py-3 text-left transition-colors hover:border-line-strong md:px-5"
                >
                  <i
                    className="ti ti-shield-check text-[18px] text-ink-faint"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-ink">
                      Check my plan
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-faint">
                      Look for conflicts, duplicates and missing deadlines
                    </span>
                  </span>
                  <i
                    className="ti ti-chevron-right shrink-0 text-[18px] text-ink-faint"
                    aria-hidden="true"
                  />
                </button>
                {weekFilter !== null && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-accent">
                      {new Date(weekFilter).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                      {" onward"}
                      <button
                        onClick={() => setWeekFilter(null)}
                        aria-label="Clear week filter"
                        className="grid size-4 place-items-center rounded-full transition-colors hover:bg-accent/20"
                      >
                        <i className="ti ti-x text-[13px]" aria-hidden="true" />
                      </button>
                    </span>
                    <span className="text-[13px] text-ink-soft">
                      {weekItems.length === 0
                        ? "Nothing booked this week"
                        : `${weekItems.length} booking${weekItems.length === 1 ? "" : "s"}`}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="divide-y divide-line">
            {trips.map((trip) => {
              const open = !collapsedTrips.has(trip.key);
              return (
                <section
                  key={trip.key}
                  className="py-7 first:pt-0 last:pb-0"
                >
                  <div className="flex items-start gap-3 px-1 pb-3">
                    {editingTrip === trip.key ? (
                      <input
                        autoFocus
                        value={editName}
                        placeholder={trip.label}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => saveRename(trip)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setEditingTrip(null);
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-2.5 py-1 font-serif text-xl text-ink outline-none focus:border-accent"
                      />
                    ) : (
                      <button
                        onClick={() =>
                          trip.isOther ? toggleTrip(trip.key) : startRename(trip)
                        }
                        className="group min-w-0 flex-1 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {!trip.isOther && trip.travel && (
                            <i
                              className="ti ti-map-pin shrink-0 text-[19px] text-ink-faint"
                              aria-hidden="true"
                            />
                          )}
                          <span className="min-w-0 truncate font-serif text-[27px] font-bold leading-[1.15] tracking-[-0.01em] text-ink md:text-[30px]">
                            {trip.label}
                          </span>
                          {!trip.isOther && (
                            <i
                              className="ti ti-pencil shrink-0 text-[13px] text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span
                          className={`mt-1.5 block text-[13px] text-ink-soft ${
                            trip.isOther ? "" : "pl-[27px]"
                          }`}
                        >
                          {trip.dateRange && `${trip.dateRange} · `}
                          {trip.bookings.length}{" "}
                          {trip.bookings.length === 1 ? "booking" : "bookings"}
                        </span>
                      </button>
                    )}
                    {!trip.isOther && trip.travel && (
                      <button
                        onClick={() => openShare(trip)}
                        aria-label="Share trip"
                        className="mt-1 grid size-7 shrink-0 place-items-center text-ink-faint hover:text-ink"
                      >
                        <i
                          className="ti ti-share-2 text-[17px]"
                          aria-hidden="true"
                        />
                      </button>
                    )}
                    <button
                      onClick={() => toggleTrip(trip.key)}
                      aria-label={open ? "Collapse trip" : "Expand trip"}
                      className="mt-1 grid size-7 shrink-0 place-items-center text-ink-faint hover:text-ink"
                    >
                      <i
                        className={`ti ti-chevron-down text-[18px] transition-transform ${open ? "" : "-rotate-90"}`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  {open &&
                    (trip.isOther || !trip.travel ? (
                      <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4 2xl:grid-cols-4">
                        {collapseFlights(trip.bookings).map((it) =>
                          isFlightGroup(it) ? (
                            <GroupedBookingCard
                              key={it.key}
                              bookings={it.tickets}
                              onOpen={openEdit}
                            />
                          ) : (
                            <BookingCard
                              key={it.id}
                              booking={it}
                              onOpen={openEdit}
                            />
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8">
                        <div className="min-w-0">
                          {/* Two lenses on the same trip: what's booked, and what's open. */}
                          <div
                            role="tablist"
                            aria-label="Trip view"
                            className="mb-3 inline-flex rounded-full border border-line bg-raised p-0.5"
                          >
                            {(
                              [
                                ["itinerary", "Itinerary"],
                                ["free", "Timetable"],
                              ] as const
                            ).map(([id, label]) => {
                              const active =
                                (id === "free") === freeTimeTrips.has(trip.key);
                              return (
                                <button
                                  key={id}
                                  role="tab"
                                  aria-selected={active}
                                  onClick={() =>
                                    setFreeTimeTrips((prev) => {
                                      const next = new Set(prev);
                                      if (id === "free") next.add(trip.key);
                                      else next.delete(trip.key);
                                      return next;
                                    })
                                  }
                                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                                    active
                                      ? "bg-ink text-white"
                                      : "text-ink-soft hover:text-ink"
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          {freeTimeTrips.has(trip.key) ? (
                            <WeekGrid bookings={trip.bookings} onOpen={openEdit} />
                          ) : (
                            <div className="space-y-3">
                              <ToBookList
                                bookings={trip.bookings}
                                onOpen={openEdit}
                                onBooked={markBooked}
                                onAssign={setAssigning}
                              />
                              <TripAgenda
                                bookings={trip.bookings}
                                onOpen={openEdit}
                                onAddStay={handleAddStay}
                              />
                            </div>
                          )}
                        </div>
                        <div className="hidden lg:block">
                          <TripSidebar
                            trip={trip}
                            onSetImage={(url) => setTripImage(trip, url)}
                          />
                        </div>
                      </div>
                    ))}
                </section>
              );
            })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4 2xl:grid-cols-4">
            {items.map((b) => (
              <BookingCard key={b.id} booking={b} onOpen={openEdit} />
            ))}
          </div>
        )}
      </div>

      {addMenuOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setAddMenuOpen(false)}
          className="fixed inset-0 z-30 cursor-default"
        />
      )}
      <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2 md:hidden">
        {addMenuOpen && (
          <div className="mb-1">
            <AddMenu
              onScan={handleScan}
              onPaste={openMenuPaste}
              onManual={openMenuManual}
            />
          </div>
        )}
        <button
          onClick={() => setAddMenuOpen((v) => !v)}
          aria-label="Add a booking"
          aria-expanded={addMenuOpen}
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[15px] font-medium text-white transition-all hover:opacity-95 active:scale-[0.96]"
        >
          <i
            className={`ti ${addMenuOpen ? "ti-x" : "ti-plus"} text-lg leading-none`}
            aria-hidden="true"
          />
          {addMenuOpen ? "Close" : "Add a booking"}
        </button>
      </div>

      <AddBookingDialog
        open={dialogOpen}
        booking={editing}
        prefill={addPrefill}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        onDelete={(id) => {
          remove(id);
          setDialogOpen(false);
        }}
        onMarkCancelled={(id) => {
          update(id, { status: "cancelled" });
          setDialogOpen(false);
        }}
      />

      <PlanDialog
        open={planDialogOpen}
        plan={editingPlan}
        onClose={() => setPlanDialogOpen(false)}
        onSave={handleSavePlan}
        onDelete={handleDeletePlan}
      />

      <PlanCheckSheet
        open={planCheckOpen}
        bookings={bookings}
        onClose={() => setPlanCheckOpen(false)}
        onOpenBooking={openEdit}
      />

      {shareTripObj && (
        <ShareModal
          trip={shareTripObj}
          onClose={() => setShareTripObj(null)}
        />
      )}

      {assigning && (
        <AssignDialog
          items={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={markAssigned}
        />
      )}

      <PasteDialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onExtracted={(c) => {
          setCandidates(c);
          setPasteOpen(false);
          setReviewOpen(true);
        }}
      />

      <ReviewSheet
        open={reviewOpen}
        candidates={candidates}
        onClose={() => setReviewOpen(false)}
        onConfirm={handleConfirmReview}
      />
    </div>
  );
}

function FirstRun({
  onScan,
  onAdd,
  onSample,
}: {
  onScan: () => void;
  onAdd: () => void;
  onSample: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-line-strong bg-raised px-6 py-12 text-center">
      <p className="font-serif text-2xl text-ink">Nothing in your lineup yet</p>
      <p className="mx-auto mt-2 max-w-[17rem] text-[14px] text-ink-soft">
        Let LineUp read your hotels, flights and events straight from your
        inbox — and watch the cancellation deadlines for you.
      </p>
      <button
        onClick={onScan}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:opacity-95 active:scale-[0.97]"
      >
        <i className="ti ti-mail-down text-[16px]" aria-hidden="true" /> Scan my email
      </button>
      <div className="mt-3 flex items-center justify-center gap-3 text-[13px] text-ink-soft">
        <button onClick={onAdd} className="underline hover:text-ink">
          enter manually
        </button>
        <span className="text-ink-faint">·</span>
        <button onClick={onSample} className="underline hover:text-ink">
          try sample data
        </button>
      </div>
    </div>
  );
}

function PlanEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-line-strong bg-raised px-6 py-12 text-center">
      <p className="font-serif text-2xl text-ink">Nothing on your list yet</p>
      <p className="mx-auto mt-2 max-w-[19rem] text-[14px] text-ink-soft">
        Park the things you want to book — concerts, trips, tickets — before
        they sell out or slip your mind.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:opacity-95 active:scale-[0.97]"
      >
        <i className="ti ti-plus text-[16px]" aria-hidden="true" /> Add to plan
      </button>
    </div>
  );
}

function RailEmpty({ rail, filtered }: { rail: Rail; filtered: boolean }) {
  if (filtered) {
    return (
      <div className="rounded-2xl border border-line bg-raised px-6 py-10 text-center text-[14px] text-ink-soft">
        Nothing of this type here.
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-line bg-raised px-6 py-10 text-center">
      {rail === "past" ? (
        <>
          <p className="text-xl font-semibold text-ink">Nothing in the last 30 days</p>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            Events from the past month will land here after they happen.
          </p>
        </>
      ) : (
        <>
          <p className="text-xl font-semibold text-ink">No upcoming plans</p>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            Add a booking to start a countdown.
          </p>
        </>
      )}
    </div>
  );
}
