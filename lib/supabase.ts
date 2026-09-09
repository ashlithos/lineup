import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Booking } from "./types";

// Namespaced so Penciled can share an existing Supabase project without collisions.
export const TABLE = "penciled_bookings";

// Server-only client (service-role key). Never import this from client code.
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// DB row (snake_case) <-> Booking (camelCase).
export interface BookingRow {
  id: string;
  title: string;
  category: string;
  vendor: string | null;
  location: string | null;
  event_at: string;
  check_out: string | null;
  arrive_at: string | null;
  duration_min: number | null;
  assignee: string | null;
  assignee_email: string | null;
  assigned_at: string | null;
  amount: number | null;
  currency: string;
  refundable: boolean;
  cancel_by: string | null;
  cancel_url: string | null;
  source_url: string | null;
  notes: string | null;
  kept: boolean | null;
  trip_name: string | null;
  trip_image: string | null;
  checklist: string | null;
  companions: string | null;
  source: string | null;
  status: string;
  last_reminded_on: string | null;
  created_at: string;
}

export function rowToBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    title: r.title,
    category: (r.category === "escape_room"
      ? "event"
      : r.category) as Booking["category"],
    vendor: r.vendor ?? undefined,
    location: r.location ?? undefined,
    eventAt: r.event_at,
    checkOut: r.check_out ?? undefined,
    arriveAt: r.arrive_at ?? undefined,
    durationMin: r.duration_min ?? undefined,
    assignee: r.assignee ?? undefined,
    assigneeEmail: r.assignee_email ?? undefined,
    assignedAt: r.assigned_at ?? undefined,
    amount: r.amount ?? undefined,
    currency: r.currency,
    refundable: r.refundable,
    cancelBy: r.cancel_by ?? undefined,
    cancelUrl: r.cancel_url ?? undefined,
    sourceUrl: r.source_url ?? undefined,
    notes: r.notes ?? undefined,
    kept: r.kept ?? undefined,
    tripName: r.trip_name ?? undefined,
    imageUrl: r.trip_image ?? undefined,
    checklist: parseChecklist(r.checklist),
    companions: r.companions ? r.companions.split(",").filter(Boolean) : undefined,
    source: (r.source as Booking["source"]) ?? undefined,
    status: r.status as Booking["status"],
    createdAt: r.created_at,
  };
}

export function bookingToRow(b: Partial<Booking>): Partial<BookingRow> {
  const row: Partial<BookingRow> = {};
  if (b.title !== undefined) row.title = b.title;
  if (b.category !== undefined) row.category = b.category;
  if (b.vendor !== undefined) row.vendor = b.vendor ?? null;
  if (b.location !== undefined) row.location = b.location ?? null;
  if (b.eventAt !== undefined) row.event_at = b.eventAt;
  if (b.checkOut !== undefined) row.check_out = b.checkOut ?? null;
  if (b.arriveAt !== undefined) row.arrive_at = b.arriveAt ?? null;
  if (b.durationMin !== undefined) row.duration_min = b.durationMin ?? null;
  if (b.assignee !== undefined) row.assignee = b.assignee ?? null;
  if (b.assigneeEmail !== undefined) row.assignee_email = b.assigneeEmail ?? null;
  if (b.assignedAt !== undefined) row.assigned_at = b.assignedAt ?? null;
  if (b.amount !== undefined) row.amount = b.amount ?? null;
  if (b.currency !== undefined) row.currency = b.currency;
  if (b.refundable !== undefined) row.refundable = b.refundable;
  if (b.cancelBy !== undefined) row.cancel_by = b.cancelBy ?? null;
  if (b.cancelUrl !== undefined) row.cancel_url = b.cancelUrl ?? null;
  if (b.sourceUrl !== undefined) row.source_url = b.sourceUrl ?? null;
  if (b.notes !== undefined) row.notes = b.notes ?? null;
  if (b.kept !== undefined) row.kept = b.kept ?? null;
  if (b.tripName !== undefined) row.trip_name = b.tripName ?? null;
  if (b.imageUrl !== undefined) row.trip_image = b.imageUrl ?? null;
  if (b.checklist !== undefined)
    row.checklist = b.checklist?.length ? JSON.stringify(b.checklist) : null;
  if (b.companions !== undefined)
    row.companions = b.companions?.length ? b.companions.join(",") : null;
  if (b.source !== undefined) row.source = b.source ?? null;
  if (b.status !== undefined) row.status = b.status;
  return row;
}

function parseChecklist(raw: string | null): Booking["checklist"] {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
