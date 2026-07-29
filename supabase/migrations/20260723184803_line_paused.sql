-- Run this after supabase-schema.sql, in your Supabase SQL editor.
-- Lets a client temporarily pause Ellie answering their number from the
-- dashboard sidebar. The real on/off switch lives on Vapi's phone number
-- resource (assistantId cleared/restored via their API) — this column is
-- just a fast local mirror of that state so the sidebar doesn't need a live
-- Vapi call on every page render.

alter table public.businesses
  add column if not exists line_paused boolean not null default false;
