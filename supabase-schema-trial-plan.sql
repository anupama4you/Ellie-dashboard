-- Run this in your Supabase SQL editor.
-- Adds a 7-day free trial and a real per-business billing anchor, replacing
-- the old assumption that every plan period starts on the 1st of the
-- calendar month (src/lib/planUsage.ts used to anchor usage counting to
-- startOfMonthInZone() regardless of when the client actually signed up).

alter table public.businesses
  add column if not exists plan_status text not null default 'active',       -- trial | active | cancelled
  add column if not exists trial_started_at timestamptz,                     -- set when a trial begins; null otherwise
  add column if not exists plan_started_at timestamptz not null default now(); -- billing-cycle anchor day

-- Backfill: ADD COLUMN ... DEFAULT now() stamps every existing row with the
-- moment this migration ran, not each business's actual start date. Anchor
-- existing clients to when they were actually created instead, so their
-- renewal day doesn't suddenly all become "today".
update public.businesses set plan_started_at = created_at;
