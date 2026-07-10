-- Run this in your Supabase SQL editor.
-- Tracks whether the booking-confirmation SMS actually succeeded for a given
-- appointment, so the dashboard can show a real "SMS sent" status instead of
-- assuming it worked just because a phone number was present.

alter table public.appointments
  add column if not exists sms_sent boolean not null default false;
