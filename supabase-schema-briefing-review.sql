-- Run this in your Supabase SQL editor.
-- Supports admin review of client Briefing edits (client saves no longer
-- push straight to the live Vapi assistant).

alter table public.businesses
  add column if not exists briefing_needs_review boolean not null default false,
  add column if not exists briefing_updated_at timestamptz;
