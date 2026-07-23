-- Run this after supabase-schema-line-paused.sql, in your Supabase SQL editor.
-- Fixes a real bug: setLineActive() found "this business's" Vapi phone
-- numbers by matching phone-number.assistantId === businesses.vapi_assistant_id
-- — which works while active, but pausing clears assistantId, so resuming
-- had no way left to find those numbers again. This column remembers the
-- resolved ids the first time, so resume never depends on a link that
-- pausing just destroyed.

alter table public.businesses
  add column if not exists vapi_phone_number_ids text[] not null default '{}';
