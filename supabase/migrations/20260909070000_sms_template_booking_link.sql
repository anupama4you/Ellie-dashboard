-- Admin-editable SMS template for businesses that text a booking link instead
-- of taking the booking over the phone (e.g. SASH Salon) — sent by the new
-- `sendBookingLink` tool, kept alongside the other sms_template_* columns
-- added in 20260909040000_sms_templates.sql. Same NULL-means-default
-- convention; substitution logic lives in src/lib/smsTemplates.ts.

alter table public.businesses
  add column if not exists sms_template_booking_link text;
