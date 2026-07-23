-- Run this after supabase-schema.sql, in your Supabase SQL editor.
-- Remembers a customer's name against their phone number per business, so it
-- can be reused later (e.g. Ellie skipping "can I get your name?" for a
-- repeat caller) without asking every time. Not surfaced in the dashboard
-- yet — this just starts accumulating the data for that future use.

create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references public.businesses(id) on delete cascade not null,
  phone         text not null, -- digits-only key, see phoneDigitsKey() in src/lib/sms.ts
  name          text not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (business_id, phone)
);

alter table public.customers enable row level security;

create policy "Users see own customers"
  on public.customers for all
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create index on public.customers(business_id, phone);
