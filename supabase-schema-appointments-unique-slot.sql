-- Run this after supabase-schema.sql, in your Supabase SQL editor.
-- Prevents double-booking the same slot when two calls (or a call and a
-- dashboard action) race — checkAvailability only reads a snapshot, so two
-- near-simultaneous bookings could both be offered, and previously both
-- inserted successfully. `where status <> 'cancelled'` so a cancelled
-- booking never blocks someone else taking that same slot afterward.

create unique index if not exists appointments_business_slot_unique
  on public.appointments (business_id, scheduled_at)
  where status <> 'cancelled';
