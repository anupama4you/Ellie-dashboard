-- Reliable, webhook-captured signal for "the caller asked to be called back
-- by a person on this call" — mirrors booking_link_sent/review_requested's
-- pattern (see 20260915010000_calls_booking_link_sent.sql), set at
-- requestCallback tool-call success time (src/app/api/vapi-webhook/route.ts).
-- Without it, a real callback request was indistinguishable from a plain
-- 'enquiry' in call classification — every call for a business whose
-- assistant only ever offers a callback (never books directly) showed up
-- as "Enquiry".
alter table public.calls add column if not exists callback_requested boolean not null default false;
