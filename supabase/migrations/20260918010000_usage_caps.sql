-- Per-client call-minutes and SMS caps, replacing the old fixed-tier
-- PLAN_LIMITS call-count cap (meaningless now that pricing is custom per
-- client — see 20260918000000_custom_plan_pricing.sql). Both nullable —
-- null means uncapped, same convention as the old catalog's "unlimited" tier.
alter table public.businesses
  add column if not exists custom_call_minutes_cap integer,
  add column if not exists custom_sms_cap integer;

-- No SMS usage was tracked anywhere before this — sendSms() just fired a
-- Twilio API call with no persistence. Counts raw messages sent, not
-- Twilio segments/credits (simpler; segment-accurate billing math isn't
-- implemented anywhere else in this codebase either).
create table if not exists public.sms_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index if not exists sms_log_business_id_sent_at_idx on public.sms_log (business_id, sent_at);

alter table public.sms_log enable row level security;

-- Only written via sendSms()'s admin client (service role, bypasses RLS) —
-- this policy just lets a client read their own usage count, same pattern
-- as public.calls.
create policy "Users see own sms_log"
  on public.sms_log for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));
