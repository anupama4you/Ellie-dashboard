import Stripe from 'stripe'

/**
 * Lazily constructed — `new Stripe('')` throws immediately, and this module
 * gets imported transitively by pages that render fine without Stripe ever
 * being configured (e.g. before the client's first conversion). Only throw
 * when a Stripe call is actually attempted.
 */
let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set — configure it before using billing features.')
    _stripe = new Stripe(key)
  }
  return _stripe
}

/**
 * Every business now has its own admin-set monthly price (businesses.custom_monthly_price_cents)
 * rather than picking from a fixed catalog — built inline as Stripe price_data
 * rather than a pre-created Price object, since there's no shared catalog to
 * pre-create prices in. Used for Checkout Session line items (starting a
 * trial, or billing immediately) — Stripe creates a Product behind the
 * scenes from product_data the first time.
 */
export function customPriceData(amountCents: number, businessName: string) {
  return {
    currency: 'aud',
    unit_amount: amountCents,
    recurring: { interval: 'month' as const },
    product_data: { name: `${businessName} — Ellie AI Receptionist` },
  }
}

/**
 * Repricing an existing subscription item's price_data requires a real
 * Product id (no inline product_data option there, unlike Checkout) — reuse
 * the product already attached to the subscription's current price rather
 * than creating a new one each time a price changes.
 */
export function subscriptionItemPriceData(amountCents: number, productId: string) {
  return {
    currency: 'aud',
    unit_amount: amountCents,
    recurring: { interval: 'month' as const },
    product: productId,
  }
}
