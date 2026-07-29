-- Run this in your Supabase SQL editor.
-- Lets the webhook correlate a booking back to the call it was made during,
-- so the Calls page can show "Booked" instead of falling through to
-- "Enquiry" (Vapi's own endedReason never reflects our custom bookAppointment
-- tool call — see src/lib/callClassify.ts).

alter table public.appointments add column if not exists vapi_call_id text;
create index if not exists appointments_vapi_call_id_idx on public.appointments(vapi_call_id);
