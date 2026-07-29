-- Run this in your Supabase SQL editor.
-- Real Stripe subscriptions replace the manual "admin flips plan_status"
-- convertToPaidAction. Trials are unaffected (still admin-started, no card) —
-- these columns are only populated once a Checkout Session actually
-- completes, via the Stripe webhook.

alter table public.businesses
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists businesses_stripe_customer_id_idx on public.businesses (stripe_customer_id);
create index if not exists businesses_stripe_subscription_id_idx on public.businesses (stripe_subscription_id);
