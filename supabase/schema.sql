-- Penciled — bookings table. Single-user, accessed only via server API routes
-- using the service-role key, so RLS is on with no policies (server bypasses it,
-- the anon key can't read or write).

create table if not exists penciled_bookings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  vendor text,
  location text,
  event_at timestamptz not null,
  amount numeric,
  currency text not null default 'USD',
  refundable boolean not null default true,
  cancel_by timestamptz,
  cancel_url text,
  notes text,
  kept boolean default false,
  source text,
  status text not null default 'upcoming',
  last_reminded_on date,        -- dedupe: at most one reminder per day per booking
  created_at timestamptz not null default now()
);

create index if not exists penciled_bookings_cancel_by_idx on penciled_bookings (cancel_by);

alter table penciled_bookings enable row level security;
-- No policies on purpose: only the service-role key (server-side) may touch this.
