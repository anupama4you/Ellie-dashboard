'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, priceIdForPlan } from '@/lib/stripe'
import { siteUrl } from '@/lib/siteUrl'
import { logAdminAction } from '@/lib/adminAudit'

/**
 * Top-level 'use server' exports, not inline closures inside the page
 * component — required because these get passed as a prop to CopyLinkButton
 * (a Client Component), not just used as a <form action>. React's stricter
 * rule for that case ("Functions cannot be passed directly to Client
 * Components unless...") rejected the inline versions; per-request values
 * that used to come from closure now arrive as bound arguments via
 * fn.bind(null, ...) at the call site instead.
 */
export async function generateInviteLinkAction(bizId: string, email: string): Promise<{ url: string } | { error: string }> {
  const admin = createAdminClient()

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=/auth/set-password` },
  })
  const hashedToken = linkData?.properties?.hashed_token
  if (linkErr || !hashedToken) return { error: linkErr?.message ?? 'Failed to generate link' }

  await logAdminAction({ action: 'invite_link_generated', businessId: bizId, metadata: { email } })

  return { url: `${await siteUrl()}/auth/callback?next=/auth/set-password&token_hash=${hashedToken}&type=recovery` }
}

/**
 * Mints a real Supabase session for the client, entirely bypassing their
 * password — the only way in if they've changed it and something needs
 * troubleshooting. Deliberately `type: 'magiclink'` rather than the
 * 'recovery' type used elsewhere in this file: recovery links detour
 * through /auth/set-password, but this should land on a normal
 * authenticated session exactly like a real login would.
 *
 * Must be opened in a separate browser context (incognito/private window)
 * from the admin's own session — consuming it in the same browser would
 * silently overwrite the admin's own session cookie, since both are the
 * same origin. See the UI copy at the call site.
 */
export async function generateImpersonationLinkAction(
  bizId: string,
  userId: string,
  clientEmail: string,
  clientName: string,
): Promise<{ url: string } | { error: string }> {
  if (!clientEmail) return { error: 'This client has no email on file' }

  const admin = createAdminClient()
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: clientEmail,
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=/` },
  })
  const hashedToken = linkData?.properties?.hashed_token
  if (linkErr || !hashedToken) return { error: linkErr?.message ?? 'Failed to generate link' }

  // Logged at generation time only — Supabase gives no signal for whether
  // or when a link is actually consumed, so "a link was minted" is the
  // honest, loggable claim here, not "admin logged in as client."
  await logAdminAction({
    action: 'impersonation_link_generated',
    businessId: bizId,
    targetUserId: userId,
    metadata: { clientEmail, clientName },
  })

  return { url: `${await siteUrl()}/auth/callback?next=/&token_hash=${hashedToken}&type=magiclink` }
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

    await logAdminAction({ action: 'payment_link_generated', businessId: bizId, metadata: { plan: bizPlan } })
    return { url: session.url }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create checkout session' }
  }
}
