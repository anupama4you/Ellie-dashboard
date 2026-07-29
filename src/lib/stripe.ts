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

const PLAN_PRICE_ENV: Record<string, string | undefined> = {
  starter:      process.env.STRIPE_PRICE_STARTER,
  core:         process.env.STRIPE_PRICE_CORE,
  professional: process.env.STRIPE_PRICE_PROFESSIONAL,
  enterprise:   process.env.STRIPE_PRICE_ENTERPRISE,
}

export function priceIdForPlan(plan: string): string {
  const id = PLAN_PRICE_ENV[plan]
  if (!id) throw new Error(`No Stripe price configured for plan "${plan}" — set STRIPE_PRICE_${plan.toUpperCase()}.`)
  return id
}
