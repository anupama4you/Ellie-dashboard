-- Reliable, webhook-captured signal for "a booking link was actually sent
-- on this call" — set at sendSms tool-call success time (see
-- src/app/api/vapi-webhook/route.ts), independent of Vapi's own end-of-call
-- structured-data analysis (report.analysis.structuredData.bookingLinkSent),
-- which is LLM-extracted from the transcript and observed to be wrong on a
-- real call (returned false when the tool had actually succeeded). The
-- end-of-call-report handler now ORs both signals together so a real tool
-- success is never miscategorised as 'enquiry' even if the analysis LLM
-- guesses wrong.
alter table public.calls add column if not exists booking_link_sent boolean not null default false;
