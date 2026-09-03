-- Run this in your Supabase SQL editor.
-- Admin-only calibration inputs for the "Revenue captured (est.)" dashboard
-- metric: businesses whose bookings happen off-platform (e.g. a client
-- booking through an external system like Timely, where Ellie only sends a
-- link rather than creating an appointments row) have no real price data
-- for those calls, so their estimated contribution is
-- linked-call-count * enquiry_conversion_rate * avg_customer_value_cents.
-- Deliberately admin-only (not client-editable) so a client can't inflate
-- their own reported revenue. Both nullable: unset means the estimated
-- portion contributes $0 rather than fabricating a number before an admin
-- has calibrated it for that business.

alter table public.businesses
  add column if not exists avg_customer_value_cents integer,
  add column if not exists enquiry_conversion_rate integer;

alter table public.businesses
  add constraint businesses_enquiry_conversion_rate_range
    check (enquiry_conversion_rate is null or (enquiry_conversion_rate >= 0 and enquiry_conversion_rate <= 100));
