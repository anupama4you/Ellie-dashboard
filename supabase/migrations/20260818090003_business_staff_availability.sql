-- Run this in your Supabase SQL editor.
-- Per-date overrides on top of a staff member's weekly `hours` template, for
-- casual/rostered staff whose working days genuinely change week to week.
-- One row per staff member per date they've been explicitly set for --
-- is_available = false means not working that day at all; = true carries
-- that date's specific window. A date with no row falls through to the
-- weekly template (or business hours), so this table only ever needs
-- entries for dates that differ from the norm. Edited live from the
-- dashboard (see rosterActions.ts) -- never goes through the Briefing
-- draft/review flow, since it's only read by live availability checks and
-- never referenced by the Vapi system prompt.

create table if not exists public.business_staff_availability (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid references public.business_staff(id) on delete cascade not null,
  date         date not null,
  is_available boolean not null,
  opens_at     time,
  closes_at    time,
  unique (staff_id, date)
);

alter table public.business_staff_availability enable row level security;

create policy "Users see own staff availability"
  on public.business_staff_availability for all
  using (staff_id in (
    select bs.id from public.business_staff bs
    join public.businesses b on b.id = bs.business_id
    where b.user_id = auth.uid()
  ));

create index on public.business_staff_availability(staff_id, date);
