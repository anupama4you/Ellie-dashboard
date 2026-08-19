-- Run this in your Supabase SQL editor.
-- Deterministic, cross-instance counter of failed booking/reschedule
-- attempts within one live call, so a caller can never get stuck in an
-- infinite offer-alternatives loop if the model keeps mis-picking a slot
-- (e.g. misreproducing a timestamp several turns after checkAvailability
-- offered it). Keyed by call id, not per-tool — a caller bouncing between
-- "book a new one" and "reschedule mine" after repeated failures should
-- still eventually escalate together. Purely internal webhook bookkeeping,
-- never surfaced to any dashboard user — RLS enabled with no policies
-- (only the service-role webhook client ever touches it, which bypasses
-- RLS).

create table if not exists public.call_scheduling_failures (
  call_id    text primary key,
  attempts   int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.call_scheduling_failures enable row level security;

create or replace function public.increment_call_scheduling_failures(p_call_id text)
returns int
language sql
as $$
  insert into public.call_scheduling_failures (call_id, attempts)
  values (p_call_id, 1)
  on conflict (call_id)
  do update set attempts = call_scheduling_failures.attempts + 1,
                updated_at = now()
  returning attempts;
$$;
