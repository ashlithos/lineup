# Penciled — PRD

> Name: **Penciled**. "Penciled in" = a plan that's real but not yet permanent — you can still erase it. Captures both the anticipation and the can-still-cancel reversibility.

**Last updated:** 2026-06-19
**Owner:** Ashley
**Status:** v1 scoping → build

---

## 1. One-liner

A single place to keep every upcoming booking, so you never miss a free-cancellation deadline and never lose track of the fun things you've planned.

## 2. The problem

You like arranging things — escape rooms, hotels, dinners, events. But you book across a dozen sites, the confirmation buries itself in your inbox, and two things go wrong:

1. **You lose money.** A hotel was free to cancel until a date you never noted. You miss it, plans change, you eat the cost.
2. **You lose the thread.** You forget what's coming up, so the anticipation — the whole point of planning — evaporates.

Existing tools don't solve this: a notes app is a dumb list, a calendar tracks the *event date* but not the *cancel-by date*, and the booking sites each silo their own reservation.

## 3. The insight (what we're actually building)

Not "a place to store bookings" — that's a list, and Notes already wins that. The product is **"don't let me lose money or miss the fun."**

Two distinct emotional jobs, designed as two surfaces over the same data:

- **Anxiety relief** → *"When's the last second I can cancel this for free?"* The painkiller. Sorted by **cancellation deadline**.
- **Anticipation** → *"What fun thing is coming up?"* The vitamin. Sorted by **event date**.

The hero number is **the gap between the cancel-by date and today** — that's the value nobody else surfaces.

## 4. Target user (v1)

Just Ashley. Single-user, no auth, no sharing, no multi-tenant. One person's bookings, one device-synced web app. Everything below is scoped to that.

## 5. Goals & non-goals

**Goals**
- Capture a booking in under 15 seconds (paste > form).
- Never miss a free-cancellation deadline — proactive reminders timed to the *deadline*, not the event.
- Make the upcoming-fun list something you *want* to open.
- Mobile-first; usable one-handed at 375px.

**Non-goals (v1)**
- ❌ Login / multi-user / sharing
- ❌ Auto-pull from Gmail (deferred — see §10)
- ❌ Actually cancelling on your behalf (we deep-link to the vendor; you click)
- ❌ Payments, price tracking, rebooking suggestions
- ❌ Native app (PWA is enough)

## 6. Core concepts & data model

A **Booking** is the only entity in v1.

```
Booking
  id              uuid
  title           text          -- "The Hive escape room", "Hôtel Particulier"
  category        enum          -- hotel | escape_room | restaurant | event | flight | other
  vendor          text          -- "Booking.com", "Resy", free text
  event_at        timestamptz   -- when the fun happens
  location        text          -- optional, freeform
  amount          numeric       -- optional, what's at stake
  currency        text          -- default user locale
  refundable      boolean       -- is there a free-cancel window at all?
  cancel_by       timestamptz   -- the hero field. free-cancellation deadline. nullable.
  cancel_url      text          -- deep link to vendor cancellation page. nullable.
  notes           text          -- confirmation #, freeform
  status          enum          -- upcoming | cancelled | done | snoozed
  created_at      timestamptz
```

Category drives an emoji/color marker for scannability: 🏨 hotel · 🔓 escape room · 🍝 restaurant · 🎟️ event · ✈️ flight · 📌 other.

## 7. UX surfaces

Two rails, one data source, toggle between them. Mobile-first.

### Rail A — "Needs attention" (default on open)
- Sorted by `cancel_by` ascending. Soonest deadline first.
- Each card leads with the **countdown to cancel-by**, not the event date.
  - `< 48h`: red/urgent treatment — *"3h left to cancel free, then you lose $240"*
  - `2–7 days`: amber
  - `> 7 days` or no deadline: calm/neutral
- Card actions: **Keep · Cancel · Snooze**. "Cancel" opens `cancel_url` (or vendor site) and marks status.

### Rail B — "Looking forward to"
- Sorted by `event_at` ascending. Soonest fun first.
- Lighter, more celebratory treatment. Countdown to the *event*: *"Escape room in 4 days 🔓"*.
- This is the "keep me excited" view — calmer, more visual, emoji markers do work here.

### Add flow
- Big **+** → **smart paste** (primary) or **manual form** (fallback).
- Smart paste: paste confirmation email text → AI extracts fields → you confirm/edit → save. One paste, done.

## 8. Reminder logic

The thing that makes it an assistant, not a list.

- Reminders fire relative to **`cancel_by`**, not `event_at`: ping at **T-48h** and **T-24h**.
- Reminder copy is a *decision*, not an alert: *"You can still cancel [The Hive] free until tomorrow 6pm — keep it or kill it?"* with keep / cancel / snooze.
- If `refundable = false` or `cancel_by` is null, no cancel reminder — but still a gentle excitement nudge T-24h before the event (optional, can mute).
- Delivery v1: **web push** (free) + a daily digest email fallback (free tier). A daily cron scans for bookings crossing a reminder threshold.

## 9. Build plan (gradual — build & ship each phase before the next)

**Phase 0 — Skeleton (≈1–2h)**
- Next.js + Tailwind + shadcn scaffold, Supabase project, `bookings` table.
- Hardcoded seed *structure* only (NO fake data — empty state from day one per house rules).
- The two-rail layout with empty states.

**Phase 1 — Manual capture + the two rails (≈2h)**
- Manual add form, edit, delete.
- Rail A (cancel-deadline sort + countdown urgency colors) and Rail B (event sort).
- Category markers. Mobile pass at 375px.
- ✅ At this point it's already useful — you can hand-enter bookings and see deadlines.

**Phase 2 — Smart paste (≈1–2h)**
- Paste confirmation text → AI extraction → confirm/edit → save.
- This is the "wow" that makes capture painless.

**Phase 3 — Reminders (≈2h, the fiddly one)**
- Supabase `pg_cron` daily job → find bookings crossing T-48h / T-24h cancel thresholds.
- Web push subscription + daily digest email fallback.
- Keep/cancel/snooze actions wired to status.

**Later / power-ups (not scoped)**
- Gmail auto-pull (see §10), shared trips, calendar sync, price-drop watch.

## 10. The deferred fork: Gmail auto-pull

We chose **manual + smart paste** for v1 on purpose.

- **Manual + paste** — ships this week, zero OAuth, no privacy review, you control what goes in.
- **Gmail auto-pull** — feels magical, but a *public* product needs Google OAuth verification + a CASA security assessment (weeks of overhead, possible cost). For single-user-you it's technically reachable today, but it's not where the first reps should go.

Decision: paste now, Gmail as a later power-up once the core loop proves valuable.

## 11. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) | Default stack; PWA-friendly |
| Styling | Tailwind + shadcn/ui | Default stack; customize, don't ship stock |
| DB | Supabase (Postgres) | One box for DB + `pg_cron` for reminders |
| AI extract | Claude Haiku | Tiny inputs, cheap, fast enough for paste |
| Push | Web Push API | Free, no native app needed |
| Email fallback | Resend (free tier) | 3k emails/mo free, simple API |
| Cron | Supabase `pg_cron` | Lives next to the data, free |
| Hosting | Vercel | Auto-deploy from main |

## 12. Trade-offs (v1)

- **Latency** — paste→extracted ~1–2s (Haiku). Everything else is local DB reads, instant.
- **Cost** — extraction ~$0.005–0.02 per paste; reminders/push/cron all free tier. **<$1/month** at personal volume.
- **Build time** — ~6–8 focused hours across phases 0–3. The reminder cron (Phase 3) is the only fiddly bit.

## 13. Success criteria (for you, single-user)

- You stop missing free-cancellation windows. (The one metric that matters.)
- Adding a booking feels faster than texting yourself about it.
- You open Rail B for fun, not just Rail A out of fear.

## 14. Open questions

- Web push on iOS requires the PWA be added to home screen — acceptable, or lean on email digest as primary?
- Snooze: re-remind at a fixed interval, or let you pick a new time?
- Do you want a "past bookings" archive, or do done/cancelled just disappear?
