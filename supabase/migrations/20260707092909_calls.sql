-- Run this in your Supabase SQL editor.
-- Local source of truth for call history — the dashboard should never need
-- to hit Vapi's API live to show call data; this table is populated by the
-- end-of-call-report webhook branch in src/app/api/vapi-webhook/route.ts.

create table public.calls (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid references public.businesses(id) on delete cascade not null,
  vapi_call_id       text not null unique,
  vapi_assistant_id  text,
  call_type          text,   -- webCall | inboundPhoneCall | outboundPhoneCall
  status             text,
  caller_name        text,
  caller_phone       text,
  assistant_phone    text,
  started_at         timestamptz,
  ended_at           timestamptz,
  duration_seconds   int,
  ended_reason       text,
  outcome            text,   -- booked | enquiry | transferred | missed | errored
  summary            text,
  success_evaluation text,
  transcript         text,
  recording_url      text,
  raw_payload        jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table public.calls enable row level security;

create policy "Users see own calls"
  on public.calls for all
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create index on public.calls(business_id, started_at desc);
create index on public.calls(vapi_assistant_id);
