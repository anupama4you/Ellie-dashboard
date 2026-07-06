-- Run this after supabase-schema.sql, in your Supabase SQL editor.
-- Additions for: Settings notification preferences, Ellie's Briefing.

alter table public.businesses
  add column if not exists notification_prefs jsonb not null default '{
    "bookingTexts": true,
    "morningBrief": true,
    "urgentAlerts": true,
    "weeklyReport": true
  }'::jsonb;

-- Ellie's Briefing --------------------------------------------------------

alter table public.businesses
  add column if not exists greeting_script text,
  add column if not exists custom_instructions text,
  add column if not exists hours jsonb not null default '{
    "mon": {"open": false, "opensAt": "09:00", "closesAt": "17:30"},
    "tue": {"open": true,  "opensAt": "09:00", "closesAt": "17:30"},
    "wed": {"open": true,  "opensAt": "09:00", "closesAt": "17:30"},
    "thu": {"open": true,  "opensAt": "09:00", "closesAt": "17:30"},
    "fri": {"open": true,  "opensAt": "09:00", "closesAt": "17:30"},
    "sat": {"open": true,  "opensAt": "09:00", "closesAt": "15:00"},
    "sun": {"open": false, "opensAt": "09:00", "closesAt": "17:30"}
  }'::jsonb,
  add column if not exists transfer_rules jsonb not null default '[
    {"label": "Caller asks for me by name", "description": "Warm transfer to my direct line", "enabled": true},
    {"label": "Complaint or unhappy caller", "description": "Take a message and text me a summary straight away", "enabled": true},
    {"label": "Media or sales calls",        "description": "Politely decline and end the call", "enabled": true}
  ]'::jsonb;

create table if not exists public.business_services (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid references public.businesses(id) on delete cascade not null,
  name              text not null,
  duration_minutes  int,
  price_cents       int,
  sort_order        int not null default 0
);

create table if not exists public.business_faqs (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references public.businesses(id) on delete cascade not null,
  question      text not null,
  answer        text not null,
  sort_order    int not null default 0
);

alter table public.business_services enable row level security;
alter table public.business_faqs     enable row level security;

create policy "Users see own services"
  on public.business_services for all
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users see own faqs"
  on public.business_faqs for all
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create index on public.business_services(business_id, sort_order);
create index on public.business_faqs(business_id, sort_order);
