import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureError } from '@/lib/monitoring'

/**
 * The only thing that ever flips a business from trial/pending to a real
 * paid subscription (or back to cancelled) once Checkout is involved —
 * convertToPaidAction only *starts* the Checkout Session, it doesn't know
 * whether the client actually completed payment. Mirrors the "webhook is
 * the source of truth" pattern in api/vapi-webhook.
 */
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    captureError(err, { handler: 'stripe-webhook:signature' })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const businessId = session.metadata?.business_id
        if (!businessId) {
          console.error('checkout.session.completed with no business_id in metadata', session.id)
          break
        }

        const newSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null
        const newCustomerId     = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null

        const { data: existing } = await admin.from('businesses')
          .select('plan_status, stripe_subscription_id')
          .eq('id', businessId)
          .single()

        // Stripe can and does retry a webhook that already succeeded on our
        // end (e.g. our 2xx response got lost in transit) — a redelivery of
        // an event for a subscription we've already activated must not
        // re-anchor the billing cycle by resetting plan_started_at to "now"
        // a second time, which would silently shift the client's renewal day.
        const alreadyActivated = !!newSubscriptionId && existing?.plan_status === 'active' && existing.stripe_subscription_id === newSubscriptionId

        const { error } = await admin.from('businesses').update({
          stripe_customer_id:     newCustomerId,
          stripe_subscription_id: newSubscriptionId,
          plan_status:            'active',
          ...(alreadyActivated ? {} : { plan_started_at: new Date().toISOString() }),
        }).eq('id', businessId)

        if (error) console.error('Failed to activate business after checkout.session.completed:', error)
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const cancelled = ['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status)

        const { error } = await admin.from('businesses')
          .update({ plan_status: cancelled ? 'cancelled' : 'active' })
          .eq('stripe_subscription_id', subscription.id)

        if (error) console.error('Failed to sync subscription status:', error)
        break
      }

      default:
        break
    }
  } catch (err) {
    captureError(err, { handler: 'stripe-webhook', eventType: event.type })
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
