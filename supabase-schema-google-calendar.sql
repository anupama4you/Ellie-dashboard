-- Run this in your Supabase SQL editor.
-- Per-business Google Calendar OAuth connection, used for real free/busy
-- checks and creating actual calendar events on booking.

create table public.calendar_connections (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid references public.businesses(id) on delete cascade not null unique,
  provider                text not null default 'google',
  calendar_id             text not null default 'primary',
  google_email            text,
  access_token_encrypted  text not null,
  refresh_token_encrypted text not null,
  token_expiry            timestamptz not null,
  status                  text not null default 'connected', -- connected | disconnected | error
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table public.calendar_connections enable row level security;

create policy "Users see own calendar connection"
  on public.calendar_connections for all
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

alter table public.appointments
  add column if not exists calendar_event_id text;
