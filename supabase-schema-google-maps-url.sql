-- Run this in your Supabase SQL editor.
-- Lets a business paste their actual Google Maps share link (more accurate
-- than a constructed search-query URL) — used in booking confirmation SMS.

alter table public.businesses
  add column if not exists google_maps_url text;
