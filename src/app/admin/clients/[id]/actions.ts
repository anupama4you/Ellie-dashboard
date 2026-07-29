'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, priceIdForPlan } from '@/lib/stripe'
import { siteUrl } from '@/lib/siteUrl'

/**
 * Top-level 'use server' exports, not inline closures inside the page
 * component — required because these get passed as a prop to CopyLinkButton
 * (a Client Component), not just used as a <form action>. React's stricter
 * rule for that case ("Functions cannot be passed directly to Client
 * Components unless...") rejected the inline versions; per-request values
 * that used to come from closure now arrive as bound arguments via
 * fn.bind(null, ...) at the call site instead.
 */
export async function generateInviteLinkAction(email: string): Promise<{ url: string } | { error: string }> {
  const admin = createAdminClient()

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=/auth/set-password` },
  })
  const hashedToken = linkData?.properties?.hashed_token
  if (linkErr || !hashedToken) return { error: linkErr?.message ?? 'Failed to generate link' }

  return { url: `${await siteUrl()}/auth/callback?next=/auth/set-password&token_hash=${hashedToken}&type=recovery` }
}

export async function generatePaymentLinkAction(
  bizId: string,
  bizName: string,
  bizPlan: string,
  clientEmail: string,
  stripeCustomerId: string | null,
): Promise<{ url: string } | { error: string }> {
  try {
    const admin = createAdminClient()
    const stripe = getStripe()

    let customerId = stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: bizName,
        email: clientEmail || undefined,
        metadata: { business_id: bizId },
      })
      customerId = customer.id
      await admin.from('businesses').update({ stripe_customer_id: customerId }).eq('id', bizId)
    }

    const appUrl = process.env.APP_URL!.replace(/\/$/, '')
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceIdForPlan(bizPlan), quantity: 1 }],
      subscription_data: { metadata: { business_id: bizId } },
      metadata: { business_id: bizId },
      success_url: `${appUrl}/?upgraded=1`,
      cancel_url: `${appUrl}/`,
    })

    if (!session.url) throw new Error('Stripe did not return a Checkout URL')
    return { url: session.url }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create checkout session' }
  }
}
