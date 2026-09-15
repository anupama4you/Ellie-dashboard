-- Reliable, webhook-captured signal for "Ellie successfully texted a
-- review link on this call" — mirrors booking_link_sent's pattern (see
-- 20260915010000_calls_booking_link_sent.sql), set at sendSms tool-call
-- success time when the model passes linkType: "review" (src/app/api/
-- vapi-webhook/route.ts). Without it, a successful review-link send was
-- indistinguishable from a plain 'enquiry' in call classification.
alter table public.calls add column if not exists review_requested boolean not null default false;
