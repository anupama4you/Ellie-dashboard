-- Run this in your Supabase SQL editor.
-- Which staff can perform a given service. NULL (the default, and every
-- existing row) means unrestricted -- any active staff member is eligible,
-- preserving today's behavior for every business that hasn't set this up.
--
-- Stored as a plain uuid[] on the service row rather than a staff<->service
-- junction table, because business_services rows are already fully replaced
-- (delete-all + reinsert) on every admin "Apply & Push" -- see
-- applyDraftAndPushPrompt -- so a junction keyed on service_id would be
-- destroyed and orphaned on every apply. business_staff.id is diff-synced
-- and stable across applies (see the staff sync comment in that same file),
-- so referencing it from here is safe; a dangling id (a staff member since
-- removed) just fails to match the live active roster and is harmlessly
-- ignored by isStaffEligibleForService.
alter table public.business_services
  add column if not exists staff_ids uuid[];
