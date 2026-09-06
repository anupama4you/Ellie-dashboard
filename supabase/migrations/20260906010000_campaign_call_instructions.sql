-- Run this in your Supabase SQL editor.
-- The client's own description of how Ellie should behave on a campaign's
-- calls, written when the campaign is created. Replaces the inbound
-- assistant's system prompt entirely for outbound calls placed from this
-- campaign (via Vapi's per-call assistantOverrides), so outbound behavior
-- is driven only by what the client wrote here, not the inbound script.
--
-- Also introduces a review gate before a campaign can place calls: the
-- client confirms consent and submits (status -> 'pending_review'), an
-- admin reviews call_instructions and approves (status -> 'active') before
-- any calls can go out — the same "client input shouldn't drive live Ellie
-- behavior unreviewed" reasoning as the Briefing draft/live split.

alter table public.outbound_campaigns
  add column if not exists call_instructions text not null default '';
