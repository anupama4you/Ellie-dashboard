-- Run this in your Supabase SQL editor.
-- Any spreadsheet column beyond name/phone/note (e.g. "Last Visit",
-- "Loyalty Tier") is captured per contact here, keyed by its sanitized
-- variable name (see sanitizeVariableKey in src/lib/outboundCsv.ts), and
-- passed through as a Vapi call variable — so a client can reference
-- {{last_visit}} etc. in a campaign's opening line/system prompt.

alter table public.outbound_campaign_contacts
  add column if not exists extra_fields jsonb not null default '{}'::jsonb;
