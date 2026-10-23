# Lineup in Claude (MCP door)

Lineup has a second door at `/mcp`, so Claude (or any MCP Apps host, like ChatGPT) can answer *"what can I still cancel?"* or *"show my December as a timetable"* with Lineup's own widget inside the chat. It's additive: the web app, `/api/*` routes, the reminder cron and the Gmail scan are unchanged.

## Tools

| Tool | Who can call it | What it does |
|---|---|---|
| `lineup_attention` | Claude + widget | Cancel-by radar: refundable bookings with an open free-cancel window, soonest first, with the amount at stake. It also names refundable bookings that have no cancel-by date. Widget: the top card has **Keep it / Cancel it**, then the rest |
| `lineup_plans` | Claude + widget | Bookings and to-books for a range (`from`/`to`) or a `trip`. Widget switches **list · cards · timetable · year** |
| `lineup_check_plan` | Claude | `runRules` findings (overlaps, unreachable events, missing legs, duplicates), as text. Rules only, no AI |
| `lineup_to_book` | Claude | To-book items with who's booking each and the book-by date |
| `lineup_set_kept` | **Widget only** | Keep / un-keep (stops the deadline reminders, same `kept` flag as the web app) |
| `lineup_set_status` | **Widget only** | `cancelled` after you cancel on the vendor's site, or back to `upcoming` (Undo). No deletes |

Everything reuses `lib/`: `urgency`, `trips`, `freetime.buildWeek`, `density.buildDensity`, `planCheck.runRules`, `handoff`. Writes go through `bookingToRow`, so wall-clock times stay intact.

**Time zone:** the server runs on UTC, but bookings are wall-clock times. "Now" is read on `MCP_TIMEZONE` (default `America/Los_Angeles`) or a `timeZone` the model passes. Without this, every deadline would look 7–8 hours later than it is.

**Cost:** no Anthropic calls. Claude does the reading and judging in the chat.

## Sign-in

Lineup has no accounts, so it borrows one login: Claude signs in through **Slowcart's Supabase project** (its OAuth 2.1 server and its `/oauth/consent` screen), and `lib/mcp/auth.ts` lets the token in only if its email is `MCP_OWNER_EMAIL`. Booking data is then read with Lineup's own service-role key, as the web app does. A valid login for anyone else gets a 401.

### Settings

Nothing new to set in Vercel. By default the door trusts Slowcart's Supabase project (its public URL and publishable key are in `lib/mcp/auth.ts`) and lets in only `REMINDER_TO_EMAIL`, the owner address Lineup already emails. To override, set any of these in Vercel → lineup → Environment Variables:

| Name | Default |
|---|---|
| `MCP_OWNER_EMAIL` | `REMINDER_TO_EMAIL` |
| `MCP_AUTH_SUPABASE_URL` / `MCP_AUTH_SUPABASE_ANON_KEY` | Slowcart's project |
| `MCP_TIMEZONE` | `America/Los_Angeles` |

If no owner email is set at all, `/mcp` stays locked: it fails closed.

The Supabase OAuth server setup lives in Slowcart's `MCP.md`; do that once and it serves both apps.

## Develop

```bash
npm run build:widget   # after editing mcp/widget/* (also runs on prebuild)
npx tsc --noEmit
```

## Known limits

- The widget bundle is ~460 KB (~100 KB gzipped), because the App SDK carries zod.
- The timetable shows the first trip with travel in range, up to 7 days, as in the web app's WeekGrid.
- Adding a booking from chat is the next phase (Claude would pass the fields it read from the email; no `/api/extract` call).
