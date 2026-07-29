-- Run this in your Supabase SQL editor.
-- Each business needs its own Twilio "From" number for SMS confirmations —
-- one shared number across all clients would mean every customer's text
-- comes from the same sender regardless of which business they booked with.

alter table public.businesses
  add column if not exists twilio_phone_number text;
