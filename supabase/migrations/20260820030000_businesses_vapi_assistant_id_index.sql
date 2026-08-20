-- Run this in your Supabase SQL editor.
-- `businesses.vapi_assistant_id` had no index at all despite being the single
-- busiest lookup in the whole webhook -- every tool call (checkAvailability,
-- bookAppointment, rescheduleAppointment, cancelAppointment,
-- findUpcomingAppointments), every transfer-destination-request, and every
-- end-of-call-report all resolve which business they're for via
-- `.eq('vapi_assistant_id', assistantId)`. Invisible at a handful of clients
-- (a full scan of a tiny table is still instant), but this degrades to an
-- actual table scan on every single webhook request as the client roster
-- grows. Unique (not just indexed) because one Vapi assistant should never
-- map to two businesses -- verified against live data first, no duplicates
-- exist. Partial (excludes NULLs) since the column is unset for businesses
-- with no assistant synced yet, matching the existing partial-index pattern
-- in appointments_business_staff_slot_unique.
create unique index if not exists businesses_vapi_assistant_id_idx
  on public.businesses (vapi_assistant_id)
  where vapi_assistant_id is not null;
