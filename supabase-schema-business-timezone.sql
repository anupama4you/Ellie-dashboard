-- Run this in your Supabase SQL editor.
-- Fixes a real booking-correctness bug: business hours / availability /
-- confirmations were computed using the server's local timezone (UTC in
-- production), not the business's actual timezone. See src/lib/timezone.ts.

alter table public.businesses
  add column if not exists timezone text not null default 'Australia/Adelaide';
