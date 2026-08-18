-- Run this in your Supabase SQL editor.
-- Links an appointment to the staff member it was booked against, when the
-- business has a roster. `on delete set null` (not cascade) -- removing a
-- staff member must never destroy their historical appointments, only
-- unassign them.

alter table public.appointments
  add column if not exists staff_id uuid references public.business_staff(id) on delete set null;

create index if not exists appointments_business_staff_idx
  on public.appointments (business_id, staff_id);
