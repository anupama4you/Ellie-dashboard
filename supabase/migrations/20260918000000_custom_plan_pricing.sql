-- Replaces the fixed starter/core/professional/enterprise/unlimited price
-- catalog with an admin-set custom monthly price per business, used as the
-- Stripe Checkout price_data.unit_amount for that business's subscription.
-- Nullable — a business can't get a trial/payment link sent until an admin
-- sets this.
alter table public.businesses
  add column if not exists custom_monthly_price_cents integer;
