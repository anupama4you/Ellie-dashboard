-- Lets a backfill (scripts/backfill-sms-log.mjs, pulling real history from
-- Twilio for businesses that had SMS activity before sms_log existed) safely
-- re-run without double-counting, and lets sendSms() itself record the sid
-- for the same reason going forward.
alter table public.sms_log
  add column if not exists twilio_sid text;
create unique index if not exists sms_log_twilio_sid_key on public.sms_log (twilio_sid);
