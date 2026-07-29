-- Run this in your Supabase SQL editor after creating the project

-- One row per client you onboard
create table public.businesses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade not null,
  name              text not null,
  phone             text,
  plan              text not null default 'core',   -- starter | core | professional | enterprise
  vapi_assistant_id text,                            -- Vapi assistant ID for this client
  created_at        timestamptz default now()
);

-- One row per appointment the AI books
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references public.businesses(id) on delete cascade not null,
  customer_name   text not null,
  customer_phone  text,
  customer_email  text,
  service         text,
  scheduled_at    timestamptz not null,
  status          text not null default 'confirmed',  -- confirmed | pending | cancelled | completed | rescheduled
  notes           text,
  created_at      timestamptz default now()
);

-- Row-level security: clients only see their own data
alter table public.businesses    enable row level security;
alter table public.appointments  enable row level security;

create policy "Users see own business"
  on public.businesses for all
  using (user_id = auth.uid());

create policy "Users see own appointments"
  on public.appointments for all
  using (
    business_id in (
      select id from public.businesses where user_id = auth.uid()
    )
  );

-- Allow the webhook (service role) to insert appointments without RLS
-- (service role key bypasses RLS by default in Supabase)

-- Indexes
create index on public.appointments(business_id, scheduled_at desc);
create index on public.businesses(user_id);
