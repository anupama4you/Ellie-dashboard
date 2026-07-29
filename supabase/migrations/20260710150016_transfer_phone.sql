-- Run this in your Supabase SQL editor.
-- The real phone number Ellie transfers callers to when a configured
-- transfer rule applies (e.g. owner request, complaint). Null means no
-- transfer destination is configured yet — the webhook falls back to
-- declining the transfer so Ellie takes a message instead.

alter table public.businesses
  add column if not exists transfer_phone_number text;
