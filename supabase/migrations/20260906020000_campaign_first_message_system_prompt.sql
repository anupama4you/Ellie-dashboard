-- Run this in your Supabase SQL editor.
-- Replaces the single freeform call_instructions field (added in
-- 20260906010000) with two fields matching how Vapi assistants are
-- actually structured: a first message (spoken immediately) and a system
-- prompt (governs the rest of the call). Both are stored per-campaign,
-- as a permanent snapshot — running a campaign uses exactly what's saved
-- on it, not a live re-fetch of anything, so editing the business-level
-- defaults later never silently changes an already-created campaign.
--
-- The business-level defaults these fields are pre-filled from (admin
-- managed, plain text, never pushed to Vapi as a real assistant config —
-- there is no separate outbound Vapi assistant, outbound calls reuse the
-- business's one existing vapi_assistant_id with a per-call override).

alter table public.outbound_campaigns
  drop column if exists call_instructions,
  add column if not exists first_message text not null default '',
  add column if not exists system_prompt text not null default '';

alter table public.businesses
  add column if not exists outbound_default_first_message text,
  add column if not exists outbound_default_system_prompt text;
