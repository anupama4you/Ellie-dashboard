-- Run this in your Supabase SQL editor.
-- Lets admins hide whole dashboard sections per client (e.g. a salon using
-- Timely for bookings doesn't need Appointments or Staff on their
-- dashboard at all). A key absent from the object means "enabled" — so
-- every existing business keeps its full current dashboard with zero
-- backfill, and future toggles need no new migration, just a new
-- FEATURE_REGISTRY entry in src/lib/dashboardFeatures.ts.

alter table public.businesses
  add column if not exists dashboard_features jsonb not null default '{}'::jsonb;
