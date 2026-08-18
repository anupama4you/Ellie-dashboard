-- Run this in your Supabase SQL editor.
-- Replaces appointments_business_slot_unique (20260723190732) now that a
-- slot is only actually double-booked if it's the same staff member (or,
-- for businesses with no roster, the same business). Postgres treats NULLs
-- as distinct in unique indexes, so a bare (business_id, staff_id,
-- scheduled_at) index would silently stop protecting no-staff businesses
-- (multiple NULL-staff rows at the same slot would no longer collide) --
-- coalescing to a fixed sentinel UUID for indexing purposes only preserves
-- today's exact behavior for businesses that never touch staff, while
-- genuinely differentiating real staff IDs.

drop index if exists public.appointments_business_slot_unique;

create unique index if not exists appointments_business_staff_slot_unique
  on public.appointments (
    business_id,
    coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid),
    scheduled_at
  )
  where status <> 'cancelled';
