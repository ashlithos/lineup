import { createMcpHandler, withMcpAuth } from "mcp-handler";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { verifyBearer } from "@/lib/mcp/auth";
import {
  checkPlanText,
  loadBookings,
  nowStampIn,
  plans,
  plansText,
  radar,
  radarText,
  toBookText,
} from "@/lib/mcp/data";
import { WIDGET_HTML } from "@/lib/mcp/widget-html.generated";
import { bookingToRow, getSupabase, TABLE } from "@/lib/supabase";

// Lineup's door for Claude (and any MCP Apps host). Additive: it reads the
// same penciled_bookings table through the same lib/ rules as the web app.
// Only the owner's sign-in gets through (lib/mcp/auth.ts). See MCP.md.

const WIDGET_URI = "ui://lineup/app.html";
const TZ_DEFAULT = process.env.MCP_TIMEZONE || "America/Los_Angeles";

const timeZone = z
  .string()
  .max(64)
  .optional()
  .describe(`IANA time zone the user is in, if known. Default ${TZ_DEFAULT}.`);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const failed = (e: unknown) => ({
  isError: true,
  ...text(e instanceof Error ? e.message : "Something went wrong reading Lineup."),
});

const handler = createMcpHandler(
  (server) => {
    registerAppTool(
      server,
      "lineup_attention",
      {
        title: "What can I still cancel?",
        description:
          "Lineup's cancel-by radar: refundable bookings whose free-cancellation window is still open, soonest deadline first, with what's at stake. " +
          "Use when the user asks what they can still cancel, what deadlines are coming up, or whether to keep a booking. " +
          "Shows a widget with Keep / Cancel buttons. Cancelling happens on the vendor's site; never claim you cancelled anything.",
        inputSchema: z.object({
          withinDays: z.number().int().min(1).max(365).optional().describe("Only deadlines within this many days."),
          timeZone,
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
        _meta: { ui: { resourceUri: WIDGET_URI } },
      },
      async ({ withinDays, timeZone: tz }) => {
        try {
          const r = radar(await loadBookings(), nowStampIn(tz || TZ_DEFAULT), withinDays);
          return { ...text(radarText(r)), structuredContent: { kind: "radar", ...r } };
        } catch (e) {
          return failed(e);
        }
      },
    );

    registerAppTool(
      server,
      "lineup_plans",
      {
        title: "Show my plans",
        description:
          "Upcoming bookings and to-book items from Lineup for a date range or trip. " +
          'Use for "show my November", "what\'s on in Lisbon", "how busy am I". ' +
          "Pick `view`: timetable for a trip's days and hours, year for how packed the coming months are, cards or list otherwise. " +
          "The user can switch views in the widget.",
        inputSchema: z.object({
          from: day.optional().describe("First day, YYYY-MM-DD. Default today."),
          to: day.optional().describe("Last day, YYYY-MM-DD. Default 60 days after `from`."),
          trip: z.string().max(80).optional().describe("Part of a trip name or city, e.g. Lisbon."),
          view: z.enum(["list", "cards", "timetable", "year"]).optional(),
          timeZone,
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
        _meta: { ui: { resourceUri: WIDGET_URI } },
      },
      async ({ from, to, trip, view, timeZone: tz }) => {
        try {
          const p = plans(await loadBookings(), nowStampIn(tz || TZ_DEFAULT), { from, to, trip, view });
          return { ...text(plansText(p)), structuredContent: { kind: "plans", ...p } };
        } catch (e) {
          return failed(e);
        }
      },
    );

    server.registerTool(
      "lineup_check_plan",
      {
        title: "Check my plan",
        description:
          "Lineup's deterministic plan checks (overlapping stays, unreachable events, missing return legs, duplicates) for a date range. " +
          "These rules are never wrong, so report them as facts, then add your own judgment separately.",
        inputSchema: z.object({ from: day.optional(), to: day.optional() }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ from, to }) => {
        try {
          return text(checkPlanText(await loadBookings(), from, to));
        } catch (e) {
          return failed(e);
        }
      },
    );

    server.registerTool(
      "lineup_to_book",
      {
        title: "What still needs booking?",
        description: "Researched-but-not-reserved items (to-book), with who's booking each and the date to book by.",
        inputSchema: z.object({ timeZone }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ timeZone: tz }) => {
        try {
          return text(toBookText(await loadBookings(), nowStampIn(tz || TZ_DEFAULT)));
        } catch (e) {
          return failed(e);
        }
      },
    );

    // Widget-only writes. The model can't call these; they fire after a tap.
    registerAppTool(
      server,
      "lineup_set_kept",
      {
        description: "Mark a booking kept (stop deadline reminders) or not. Called by the radar's Keep button.",
        inputSchema: z.object({ id: z.string().min(1), kept: z.boolean() }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        _meta: { ui: { resourceUri: WIDGET_URI, visibility: ["app"] } },
      },
      async ({ id, kept }) => update(id, { kept }),
    );

    registerAppTool(
      server,
      "lineup_set_status",
      {
        description:
          "Mark a booking cancelled after the user cancelled it with the vendor, or back to upcoming (undo). Called by the radar's Cancel → confirm.",
        inputSchema: z.object({ id: z.string().min(1), status: z.enum(["cancelled", "upcoming"]) }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        _meta: { ui: { resourceUri: WIDGET_URI, visibility: ["app"] } },
      },
      async ({ id, status }) => update(id, { status }),
    );

    registerAppResource(server, "Lineup", WIDGET_URI, {}, async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: WIDGET_HTML,
          _meta: {
            ui: {
              // Figtree + DM Mono, Lineup's type.
              csp: { resourceDomains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"] },
              prefersBorder: false,
            },
          },
        },
      ],
    }));
  },
  { serverInfo: { name: "lineup", version: "1.0.0" } },
);

// Same write path as PATCH /api/bookings/[id]: through bookingToRow, so the
// row stays in the shape the web app reads.
async function update(id: string, patch: { kept?: boolean; status?: "cancelled" | "upcoming" }) {
  const supabase = getSupabase();
  if (!supabase) return failed(new Error("Lineup's database isn't configured."));
  const { data, error } = await supabase
    .from(TABLE)
    .update(bookingToRow(patch))
    .eq("id", id)
    .select("id, title, kept, status");
  if (error || !data?.length) return failed(new Error(error ? `Couldn't update: ${error.message}` : "No such booking."));
  const b = data[0] as { id: string; title: string; kept: boolean | null; status: string };
  return {
    ...text(`${b.title}: ${patch.kept !== undefined ? (b.kept ? "kept" : "not kept") : b.status}.`),
    structuredContent: { id: b.id, kept: !!b.kept, status: b.status },
  };
}

// The 401 challenge points at this route's own metadata, whose `resource` is
// the /mcp URL Claude asks the auth server for a token to.
const authed = withMcpAuth(handler, verifyBearer, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
});

export { authed as GET, authed as POST, authed as DELETE };
