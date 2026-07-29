-- Run this in your Supabase SQL editor.
-- Client Briefing edits now land here as a staged draft instead of writing
-- straight to the live businesses/business_services/business_faqs columns
-- the call-handling webhook reads. Only the admin's "Apply & Push" action
-- (System Prompt tab) copies this into live data, in lockstep with pushing
-- the matching system prompt to Vapi, so the tools and the prompt text can
-- never drift apart.
--
-- Shape matches BriefingPayload in src/app/(dashboard)/briefing/actions.ts:
-- { greetingScript, customInstructions, hours, transferRules, services[], faqs[], companyInfo }
-- Null until the client has ever saved a Briefing change.

alter table public.businesses
  add column if not exists draft_briefing jsonb;
