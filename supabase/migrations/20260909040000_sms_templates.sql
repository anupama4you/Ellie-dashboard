-- Per-business, admin-editable SMS templates for booking/reschedule/
-- cancellation confirmations. NULL means "use the built-in default" —
-- see getSmsTemplate() in src/lib/smsTemplates.ts, which is the single
-- source of truth for both the fallback wording and the {{placeholder}}
-- substitution logic. Editable only via the admin panel (createAdminClient,
-- service role) — no RLS policy is added for client-side writes, matching
-- every other admin-only-editable column on this table.

alter table public.businesses
  add column if not exists sms_template_booking text,
  add column if not exists sms_template_reschedule text,
  add column if not exists sms_template_cancellation text;
