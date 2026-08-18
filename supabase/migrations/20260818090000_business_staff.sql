-- Run this in your Supabase SQL editor.
-- A business's staff roster, so appointments can be booked against a
-- specific person instead of the business as one undifferentiated resource.
-- `hours` mirrors businesses.hours' shape (per-day {open, opensAt, closesAt});
-- null means "same as business hours" -- the common case, so single-provider
-- businesses and staff who just work the business's hours need no setup.

create table if not exists public.business_staff (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid references public.businesses(id) on delete cascade not null,
  name         text not null,
  active       boolean not null default true,
  sort_order   int not null default 0,
  hours        jsonb
);

alter table public.business_staff enable row level security;

create policy "Users see own staff"
  on public.business_staff for all
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create index on public.business_staff(business_id, sort_order);
