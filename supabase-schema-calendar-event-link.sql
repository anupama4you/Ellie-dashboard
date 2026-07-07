-- Run this in your Supabase SQL editor.
-- Stores the actual Google Calendar event URL (not just the ID) so the
-- Appointments UI can link straight to it.

alter table public.appointments
  add column if not exists calendar_event_link text;
