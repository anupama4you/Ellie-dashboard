-- Run this in your Supabase SQL editor.
-- Outbound calling campaigns: a client uploads a spreadsheet of contacts
-- (already filtered by them — no in-app filtering logic) and Ellie places
-- calls to them in manual batches. Scoped to one location (business_id)
-- like every other per-location resource. See
-- docs/superpowers/specs/2026-09-06-outbound-calling-campaigns-design.md.

create table if not exists public.outbound_campaigns (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid references public.businesses(id) on delete cascade not null,
  name                 text not null,
  status               text not null default 'draft', -- draft | active | completed
  consent_confirmed_at timestamptz,
  created_at           timestamptz not null default now()
);

alter table public.outbound_campaigns enable row level security;

create policy "Users see own campaigns"
  on public.outbound_campaigns for all
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create index on public.outbound_campaigns(business_id);

create table if not exists public.outbound_campaign_contacts (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.outbound_campaigns(id) on delete cascade not null,
  name         text not null,
  phone        text not null,
  note         text,
  status       text not null default 'pending', -- pending | calling | done
  vapi_call_id text,
  outcome      text,
  created_at   timestamptz not null default now()
);

alter table public.outbound_campaign_contacts enable row level security;

create policy "Users see own campaign contacts"
  on public.outbound_campaign_contacts for all
  using (campaign_id in (
    select id from public.outbound_campaigns where business_id in (
      select id from public.businesses where user_id = auth.uid()
    )
  ));

create index on public.outbound_campaign_contacts(campaign_id);
create unique index on public.outbound_campaign_contacts(vapi_call_id) where vapi_call_id is not null;
