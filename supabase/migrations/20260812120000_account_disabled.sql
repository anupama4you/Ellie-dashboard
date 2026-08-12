-- Run this in your Supabase SQL editor.
-- Lets an admin fully cut off a client's dashboard/access — unlike
-- plan_status (trial/active/cancelled), which is purely a display label with
-- no enforcement anywhere in the app, this column is actually checked: see
-- (dashboard)/layout.tsx, which shows a blocked-access screen instead of the
-- dashboard when true. Distinct from `line_paused` (client-controlled, just
-- pauses Ellie answering calls) — this is admin-controlled and blocks the
-- dashboard itself.

alter table public.businesses
  add column if not exists account_disabled boolean not null default false;
