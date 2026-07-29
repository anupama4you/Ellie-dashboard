-- Run this in your Supabase SQL editor.
-- Expands Ellie's Briefing into a fuller "Company Information" profile —
-- description, website, and location, all fed into the assistant's system
-- prompt alongside the existing hours/services/FAQs/transfer rules.

alter table public.businesses
  add column if not exists description text,
  add column if not exists website text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postcode text;
