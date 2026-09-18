import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, subscriptionItemPriceData } from '@/lib/stripe'
import { Mail, Trash2, CheckCircle2, Sparkles, Send, Ban, ExternalLink, AlertTriangle, Plus, Zap } from 'lucide-react'
import { TRIAL_DAYS } from '@/lib/planUsage'
import { addDaysInZone, formatInZone, AU_TIMEZONES } from '@/lib/timezone'
import AdminClientHeader from '@/components/AdminClientHeader'
import AdminSubmitButton from '@/components/AdminSubmitButton'
import CopyLinkButton from '@/components/CopyLinkButton'
import { generateInviteLinkAction, generatePaymentLinkAction, generateTrialSignupLinkAction, generateImpersonationLinkAction } from './actions'
import { logAdminAction } from '@/lib/adminAudit'
import { assertAdmin } from '@/lib/adminAuth'
import { sendEmail } from '@/lib/resend'
import { siteUrl } from '@/lib/siteUrl'
import { FEATURE_REGISTRY, resolveDashboardFeatures } from '@/lib/dashboardFeatures'
import { SMS_TEMPLATE_DEFAULTS } from '@/lib/smsTemplates'


export default async function EditClientPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ reset?: string; saved?: string; paymentLink?: string; locationError?: string; deleteError?: string; stripeSyncWarning?: string }>
}) {
  const { id }                       = await params
  const { reset, saved, paymentLink, locationError, deleteError, stripeSyncWarning } = await searchParams

  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('*').eq('id', id).single()
  if (!biz) redirect('/admin/clients')

  const { data: { user: clientUser } } = await admin.auth.admin.getUserById(biz.user_id)
  const clientEmail = clientUser?.email ?? ''

  // Capture only the primitives the server actions need
  const bizId                    = biz.id
  const userId                   = biz.user_id
  const bizName                  = biz.name as string
  const bizCustomMonthlyPriceCents = biz.custom_monthly_price_cents as number | null
  const bizCallMinutesCap        = biz.custom_call_minutes_cap as number | null
  const bizSmsCap                = biz.custom_sms_cap as number | null
  const bizStripeCustomerId      = biz.stripe_customer_id as string | null
  const bizStripeSubscriptionId  = biz.stripe_subscription_id as string | null
  const bizAccountDisabled       = biz.account_disabled as boolean
  const dashboardFeatures        = resolveDashboardFeatures(biz)
  const bizAvgCustomerValueCents = biz.avg_customer_value_cents as number | null
  const bizEnquiryConversionRate = biz.enquiry_conversion_rate as number | null
  const bizSmsTemplateBooking      = biz.sms_template_booking as string | null
  const bizSmsTemplateReschedule   = biz.sms_template_reschedule as string | null
  const bizSmsTemplateCancellation = biz.sms_template_cancellation as string | null
  const bizSmsTemplateBookingLink  = biz.sms_template_booking_link as string | null

  const { data: siblingLocations } = await admin
    .from('businesses')
    .select('id, name, plan')
    .eq('user_id', userId)
    .neq('id', bizId)
    .order('created_at', { ascending: true })

  // Test-mode keys (sk_test_...) and live keys (sk_live_...) each have their
  // own dashboard — get this wrong and the "View in Stripe" link 404s.
  const stripeDashboardBase = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')
    ? 'https://dashboard.stripe.com'
    : 'https://dashboard.stripe.com/test'

  async function updateBusiness(formData: FormData) {
    'use server'
    await assertAdmin()
    const admin = createAdminClient()

    const newEmail = (formData.get('email') as string).trim()
    if (newEmail && newEmail !== clientEmail) {
      await admin.auth.admin.updateUserById(userId, { email: newEmail })
    }

    const priceStr = (formData.get('monthly_price') as string).trim()
    const newPriceCents = priceStr ? Math.round(parseFloat(priceStr) * 100) : null
    const priceChanged = newPriceCents !== bizCustomMonthlyPriceCents

    const minutesCapStr = (formData.get('call_minutes_cap') as string).trim()
    const newCallMinutesCap = minutesCapStr ? Math.round(parseFloat(minutesCapStr)) : null
    const smsCapStr = (formData.get('sms_cap') as string).trim()
    const newSmsCap = smsCapStr ? Math.round(parseFloat(smsCapStr)) : null

    // Empty string -> null (not configured), rather than 0 -> a fabricated
    // $0 estimate would be indistinguishable from a deliberately-set $0.
    const avgValueStr = (formData.get('avg_customer_value') as string).trim()
    const avgCustomerValueCents = avgValueStr ? Math.round(parseFloat(avgValueStr) * 100) : null
    const conversionRateStr = (formData.get('conversion_rate') as string).trim()
    const enquiryConversionRate = conversionRateStr ? Math.round(parseFloat(conversionRateStr)) : null

    // A price change for a client with a live Stripe subscription has to
    // reprice it too — otherwise the dashboard shows the new price while
    // Stripe keeps billing (or, once the trial ends, will auto-charge) the
    // old one. Trial businesses have a live subscription from day one now
    // (card collected up front, see generateTrialSignupLinkAction) — not
    // just active ones — so both need repricing. Only a cancelled business
    // (or one that never had a subscription) has nothing to touch. Stripe's
    // default proration behaviour applies for an already-active subscription.
    let stripeSyncFailed = false
    if (priceChanged && newPriceCents != null && bizStripeSubscriptionId && (biz.plan_status === 'active' || biz.plan_status === 'trial')) {
      try {
        const stripe = getStripe()
        const subscription = await stripe.subscriptions.retrieve(bizStripeSubscriptionId)
        const item = subscription.items.data[0]
        if (!item) throw new Error('Subscription has no line item to reprice')
        const productId = typeof item.price.product === 'string' ? item.price.product : item.price.product.id
        await stripe.subscriptions.update(bizStripeSubscriptionId, {
          items: [{ id: item.id, price_data: subscriptionItemPriceData(newPriceCents, productId) }],
        })
      } catch (err) {
        // The local price field still gets updated below — the client's
        // dashboard price shouldn't stay silently wrong just because the
        // Stripe sync failed. Surfaced to the admin via the redirect so they
        // know to fix the subscription's price by hand in Stripe.
        console.error('Failed to reprice Stripe subscription for price change:', err)
        stripeSyncFailed = true
      }
    }

    await admin.from('businesses').update({
      name:                (formData.get('name') as string).trim(),
      phone:               (formData.get('phone') as string).trim() || null,
      custom_monthly_price_cents: newPriceCents,
      custom_call_minutes_cap: newCallMinutesCap,
      custom_sms_cap: newSmsCap,
      vapi_assistant_id:   (formData.get('assistant_id') as string).trim() || null,
      twilio_phone_number: (formData.get('twilio_phone_number') as string).trim() || null,
      timezone:            formData.get('timezone') as string,
      avg_customer_value_cents: avgCustomerValueCents,
      enquiry_conversion_rate:  enquiryConversionRate,
    }).eq('id', bizId)

    await logAdminAction({
      action: 'client_details_updated',
      businessId: bizId,
      metadata: { priceChanged, emailChanged: !!newEmail && newEmail !== clientEmail, stripeSyncFailed },
    })

    redirect(`/admin/clients/${bizId}?saved=1${stripeSyncFailed ? '&stripeSyncWarning=1' : ''}`)
  }

  async function sendPasswordReset() {
    'use server'
    await assertAdmin()
    const admin = createAdminClient()

    // Generate the link ourselves and send via Resend rather than Supabase's
    // /auth/v1/recover, which goes through Supabase's built-in email sender
    // — rate-limited on every plan tier. Same token_hash/type query-param
    // approach as the invite flow, so /auth/callback/route.ts's verifyOtp()
    // can read it directly instead of hitting Supabase's fragment-redirecting
    // /auth/v1/verify endpoint.
    //
    // `next` carries its own `intent=reset` query param (not just Supabase's
    // `type=recovery`) because generateInviteLinkAction below *also* uses
    // `type: 'recovery'` for an unrelated reason (Copy Invite Link) — if
    // /auth/set-password keyed its "already has a password" bypass off
    // `type` alone, a stale copied invite link would bypass it too. This
    // marker is reset-specific and nothing else sets it.
    const setPasswordNext = encodeURIComponent('/auth/set-password?intent=reset')
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: clientEmail,
      options: { redirectTo: `${await siteUrl()}/auth/callback?next=${setPasswordNext}` },
    })
    const hashedToken = linkData?.properties?.hashed_token
    if (linkErr || !hashedToken) {
      console.error('Failed to generate password reset link:', linkErr)
      redirect(`/admin/clients/${bizId}?reset=error`)
    }

    const resetUrl = `${await siteUrl()}/auth/callback?next=${setPasswordNext}&token_hash=${hashedToken}&type=recovery`
    try {
      await sendEmail(clientEmail, 'Reset your Ellie dashboard password', `
        <p>Hi,</p>
        <p>Click the link below to set a new password for your Ellie dashboard.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>If the link doesn't work, copy and paste this URL into your browser:<br>${resetUrl}</p>
      `)
    } catch (emailErr) {
      console.error('Failed to send password reset email via Resend:', emailErr)
      redirect(`/admin/clients/${bizId}?reset=error`)
    }

    await logAdminAction({ action: 'password_reset_sent', businessId: bizId, targetUserId: userId, metadata: { clientEmail } })

    redirect(`/admin/clients/${bizId}?reset=sent`)
  }

  async function deleteClient() {
    'use server'
    await assertAdmin()
    const admin = createAdminClient()

    // businesses.user_id cascades on auth-user delete, so deleting the login
    // would take every sibling location (and their appointments/calls/etc)
    // with it. Only remove the login once this is the last location left —
    // queried fresh here rather than trusting a page-load-time closure, since
    // another location could have been added or removed since this page
    // rendered.
    //
    // A failed query returns data: null too, which is indistinguishable from
    // "no siblings" — proceeding on that would delete the shared login (and
    // cascade through every sibling location) because of a transient error.
    // Abort instead: deleting nothing is always recoverable, this isn't.
    const { data: remainingLocations, error: siblingCheckError } = await admin
      .from('businesses')
      .select('id')
      .eq('user_id', userId)
      .neq('id', bizId)

    if (siblingCheckError) {
      console.error('Failed to check for sibling locations before deleting — aborting rather than risk deleting a shared login in error:', siblingCheckError)
      redirect(`/admin/clients/${bizId}?deleteError=1`)
    }

    await logAdminAction({
      action: 'client_deleted',
      businessId: bizId,
      targetUserId: userId,
      metadata: { bizName, deletedLogin: remainingLocations.length === 0 },
    })

    await admin.from('businesses').delete().eq('id', bizId)

    if (remainingLocations.length === 0) {
      await admin.auth.admin.deleteUser(userId)
    }

    redirect('/admin/clients')
  }

  /**
   * plan_status never flips locally here — same "webhook is the source of
   * truth" rule as before, just now applied to trial-start too (previously
   * this button set plan_status='trial' immediately with no Stripe
   * involvement at all; now the trial only really starts once the client
   * completes Checkout and api/stripe-webhook's checkout.session.completed
   * handler confirms it). Requires a monthly price to be set first — that's
   * both the trial's eventual charge amount and Checkout's price_data.
   */
  async function sendTrialSignupLinkAction() {
    'use server'
    await assertAdmin()
    if (!clientEmail) redirect(`/admin/clients/${bizId}?paymentLink=error`)
    if (!bizCustomMonthlyPriceCents) redirect(`/admin/clients/${bizId}?paymentLink=noprice`)

    const result = await generateTrialSignupLinkAction(bizId, bizName, bizCustomMonthlyPriceCents, clientEmail, bizStripeCustomerId)
    if ('error' in result) {
      console.error('Failed to create trial signup link:', result.error)
      redirect(`/admin/clients/${bizId}?paymentLink=error`)
    }

    try {
      await sendEmail(clientEmail, `Start your free trial of Ellie for ${bizName}`, `
        <p>Hi,</p>
        <p>Click the link below to start your ${TRIAL_DAYS}-day free trial of Ellie for ${bizName}. We just need your card on
        file — you won't be charged until the trial ends, and you can cancel any time before then.</p>
        <p><a href="${result.url}">Start your free trial</a></p>
        <p>If the link doesn't work, copy and paste this URL into your browser:<br>${result.url}</p>
      `)
    } catch (err) {
      console.error('Failed to send trial signup link:', err)
      redirect(`/admin/clients/${bizId}?paymentLink=error`)
    }

    redirect(`/admin/clients/${bizId}?paymentLink=sent`)
  }

  /**
   * Skip the remaining trial days and charge the card already on file right
   * now — Stripe ends the trial and immediately invoices, same as it would
   * automatically do on day 7. api/stripe-webhook's customer.subscription.updated
   * handler picks up the resulting trialing -> active transition and flips
   * plan_status/plan_started_at, same as the automatic case.
   */
  async function endTrialNowAction() {
    'use server'
    await assertAdmin()
    if (!bizStripeSubscriptionId) redirect(`/admin/clients/${bizId}?saved=1`)

    try {
      await getStripe().subscriptions.update(bizStripeSubscriptionId, { trial_end: 'now' })
    } catch (err) {
      console.error('Failed to end trial early:', err)
      redirect(`/admin/clients/${bizId}?stripeSyncWarning=1`)
    }

    await logAdminAction({ action: 'trial_ended_early', businessId: bizId, metadata: { stripeSubscriptionId: bizStripeSubscriptionId } })
    redirect(`/admin/clients/${bizId}?saved=1`)
  }

  /**
   * The manual "bill immediately, no trial" escape hatch — e.g. a client who
   * doesn't want a trial, or converting a legacy locally-tracked trial that
   * predates this Stripe-backed flow and has no real subscription yet.
   */
  async function sendPaymentLinkAction() {
    'use server'
    await assertAdmin()
    if (!clientEmail) redirect(`/admin/clients/${bizId}?paymentLink=error`)
    if (!bizCustomMonthlyPriceCents) redirect(`/admin/clients/${bizId}?paymentLink=noprice`)

    const result = await generatePaymentLinkAction(bizId, bizName, bizCustomMonthlyPriceCents, clientEmail, bizStripeCustomerId)
    if ('error' in result) {
      console.error('Failed to create payment link:', result.error)
      redirect(`/admin/clients/${bizId}?paymentLink=error`)
    }

    try {
      await sendEmail(clientEmail, `Set up payment for ${bizName} on Ellie`, `
        <p>Hi,</p>
        <p>Click the link below to set up payment for Ellie.</p>
        <p><a href="${result.url}">Set up payment</a></p>
        <p>If the link doesn't work, copy and paste this URL into your browser:<br>${result.url}</p>
      `)
    } catch (err) {
      console.error('Failed to send payment link:', err)
      redirect(`/admin/clients/${bizId}?paymentLink=error`)
    }

    redirect(`/admin/clients/${bizId}?paymentLink=sent`)
  }

  async function cancelPlanAction() {
    'use server'
    await assertAdmin()
    const admin = createAdminClient()

    if (bizStripeSubscriptionId) {
      try {
        await getStripe().subscriptions.cancel(bizStripeSubscriptionId)
      } catch (err) {
        console.error('Failed to cancel Stripe subscription — marking cancelled locally anyway:', err)
      }
    }

    await admin.from('businesses').update({ plan_status: 'cancelled' }).eq('id', bizId)
    await logAdminAction({ action: 'plan_cancelled', businessId: bizId, metadata: { stripeSubscriptionId: bizStripeSubscriptionId } })
    redirect(`/admin/clients/${bizId}?saved=1`)
  }

  /** The one real access gate — see (dashboard)/layout.tsx. Unlike plan_status, this actually blocks the client's dashboard. */
  async function toggleAccountDisabledAction() {
    'use server'
    await assertAdmin()
    const admin = createAdminClient()
    await admin.from('businesses').update({ account_disabled: !bizAccountDisabled }).eq('id', bizId)
    await logAdminAction({ action: bizAccountDisabled ? 'account_enabled' : 'account_disabled', businessId: bizId })
    redirect(`/admin/clients/${bizId}?saved=1`)
  }

  /** Only explicit `false`s are stored — an unchecked box disables that key, a checked one is simply omitted (absent = enabled). */
  async function updateDashboardFeaturesAction(formData: FormData) {
    'use server'
    await assertAdmin()
    const admin = createAdminClient()
    const dashboard_features = Object.fromEntries(
      FEATURE_REGISTRY
        .filter(({ key }) => formData.get(key) !== 'on')
        .map(({ key }) => [key, false]),
    )
    await admin.from('businesses').update({ dashboard_features }).eq('id', bizId)
    await logAdminAction({ action: 'dashboard_features_updated', businessId: bizId, metadata: { dashboard_features } })
    redirect(`/admin/clients/${bizId}?saved=1`)
  }

  /** Blank field -> null (falls back to the built-in default in src/lib/smsTemplates.ts) — never stores an empty string as "the customer's actual template." */
  async function updateSmsTemplatesAction(formData: FormData) {
    'use server'
    await assertAdmin()
    const admin = createAdminClient()
    const booking      = (formData.get('sms_template_booking') as string).trim()
    const reschedule   = (formData.get('sms_template_reschedule') as string).trim()
    const cancellation = (formData.get('sms_template_cancellation') as string).trim()
    const bookingLink  = (formData.get('sms_template_booking_link') as string).trim()
    await admin.from('businesses').update({
      sms_template_booking:      booking || null,
      sms_template_reschedule:   reschedule || null,
      sms_template_cancellation: cancellation || null,
      sms_template_booking_link: bookingLink || null,
    }).eq('id', bizId)
    await logAdminAction({
      action: 'sms_templates_updated',
      businessId: bizId,
      metadata: { customBooking: !!booking, customReschedule: !!reschedule, customCancellation: !!cancellation, customBookingLink: !!bookingLink },
    })
    redirect(`/admin/clients/${bizId}?saved=1`)
  }

  /**
   * Adds another location to this same client login (a new businesses row
   * sharing userId) rather than creating a new auth user/invite — the
   * location joins the client's existing dashboard account. Mirrors
   * admin/clients/new/page.tsx's createClientAction's business-row fields.
   */
  async function addLocationAction(formData: FormData) {
    'use server'
    await assertAdmin()
    const admin = createAdminClient()

    const { data: newBiz, error } = await admin.from('businesses').insert({
      user_id:           userId,
      name:              (formData.get('name') as string).trim(),
      phone:             (formData.get('phone') as string).trim() || null,
      plan:              'custom',
      vapi_assistant_id: (formData.get('assistant_id') as string).trim() || null,
      timezone:          (formData.get('timezone') as string) || 'Australia/Adelaide',
    }).select('id').single()

    if (error || !newBiz) {
      redirect(`/admin/clients/${bizId}?locationError=1`)
    }

    await logAdminAction({ action: 'location_added', businessId: newBiz.id, targetUserId: userId })

    redirect(`/admin/clients/${newBiz.id}/prompt?created=1&newLocation=1`)
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">

        <AdminClientHeader
          id={bizId}
          name={biz.name}
          email={clientEmail}
          plan={biz.plan}
          planStatus={biz.plan_status}
          hasAssistant={!!biz.vapi_assistant_id}
          active="details"
        />

        {saved === '1' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(15,163,122,0.07)', border: '1px solid rgba(15,163,122,0.2)', color: 'var(--signal)' }}>
            <CheckCircle2 size={15} className="shrink-0" />
            Client details saved.
          </div>
        )}
        {stripeSyncWarning === '1' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)', color: 'var(--coral)' }}>
            <AlertTriangle size={15} className="shrink-0" />
            Plan saved, but updating the price on their live Stripe subscription failed — check the server logs and fix it in Stripe directly, or they&apos;ll be billed at the old rate.
          </div>
        )}
        {reset === 'sent' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(15,163,122,0.07)', border: '1px solid rgba(15,163,122,0.2)', color: 'var(--signal)' }}>
            <CheckCircle2 size={15} className="shrink-0" />
            Password reset email sent to {clientEmail}
          </div>
        )}
        {reset === 'error' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)', color: 'var(--coral)' }}>
            <AlertTriangle size={15} className="shrink-0" />
            Couldn&apos;t send the password reset email — check the server logs and try again.
          </div>
        )}
        {paymentLink === 'sent' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(15,163,122,0.07)', border: '1px solid rgba(15,163,122,0.2)', color: 'var(--signal)' }}>
            <CheckCircle2 size={15} className="shrink-0" />
            Payment link sent to {clientEmail}
          </div>
        )}
        {paymentLink === 'error' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)', color: 'var(--coral)' }}>
            <AlertTriangle size={15} className="shrink-0" />
            Couldn&apos;t send the link — check the server logs, or use the &quot;Copy&quot; button instead.
          </div>
        )}
        {paymentLink === 'noprice' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)', color: 'var(--coral)' }}>
            <AlertTriangle size={15} className="shrink-0" />
            Set a monthly price for this client first (in Client details, below).
          </div>
        )}
        {deleteError === '1' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)', color: 'var(--coral)' }}>
            <AlertTriangle size={15} className="shrink-0" />
            Couldn&apos;t safely check this client&apos;s other locations before deleting — nothing was deleted. Try again, and check the server logs if it keeps happening.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">

          {/* Edit form */}
          <form action={updateBusiness}
            className="rounded-2xl overflow-hidden h-fit"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>

            <div className="relative px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(109,74,255,0.35), transparent)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Client details</h2>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5" style={{ gridColumn: '1 / -1' }}>
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Email</label>
                <input type="email" name="email" defaultValue={clientEmail} className="admin-input" />
              </div>

              <div className="flex flex-col gap-1.5" style={{ gridColumn: '1 / -1' }}>
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Business Name *</label>
                <input type="text" name="name" defaultValue={biz.name} required className="admin-input" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Phone</label>
                <input type="tel" name="phone" defaultValue={biz.phone ?? ''} className="admin-input" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Monthly price ($)</label>
                <input type="number" name="monthly_price" step="0.01" min="0"
                  defaultValue={bizCustomMonthlyPriceCents != null ? (bizCustomMonthlyPriceCents / 100).toFixed(2) : ''}
                  placeholder="149.00"
                  className="admin-input" />
                <p className="text-xs" style={{ color: 'var(--t5)' }}>
                  What this client is charged once their trial ends (or immediately, if billed without a trial). Required before a trial/payment link can be sent.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Call minutes cap (per month)</label>
                <input type="number" name="call_minutes_cap" step="1" min="0"
                  defaultValue={bizCallMinutesCap ?? ''}
                  placeholder="No cap"
                  className="admin-input" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>SMS cap (per month)</label>
                <input type="number" name="sms_cap" step="1" min="0"
                  defaultValue={bizSmsCap ?? ''}
                  placeholder="No cap"
                  className="admin-input" />
                <p className="text-xs" style={{ color: 'var(--t5)' }}>
                  Both caps are purely for the client&apos;s usage dashboard — leaving either blank means uncapped. Unlimited during any trial regardless of these.
                </p>
              </div>

              <div className="flex flex-col gap-1.5" style={{ gridColumn: '1 / -1' }}>
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Timezone</label>
                <select name="timezone" defaultValue={biz.timezone ?? 'Australia/Adelaide'} className="admin-input admin-select">
                  {AU_TIMEZONES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <p className="text-xs" style={{ color: 'var(--t5)' }}>
                  Business hours, appointment times, and SMS confirmations are all computed in this timezone — getting it wrong books real appointments at the wrong time.
                </p>
              </div>

              <div className="flex flex-col gap-1.5" style={{ gridColumn: '1 / -1' }}>
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Vapi Assistant ID</label>
                <input type="text" name="assistant_id"
                  defaultValue={biz.vapi_assistant_id ?? ''}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="admin-input font-mono" />
              </div>

              <div className="flex flex-col gap-1.5" style={{ gridColumn: '1 / -1' }}>
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Twilio Phone Number</label>
                <input type="tel" name="twilio_phone_number"
                  defaultValue={biz.twilio_phone_number ?? ''}
                  placeholder="+61280000000"
                  className="admin-input font-mono" />
                <p className="text-xs" style={{ color: 'var(--t5)' }}>
                  This business&apos;s own number — SMS confirmations are sent from this, not a shared number.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Avg. customer/job value ($)</label>
                <input type="number" name="avg_customer_value" step="0.01" min="0"
                  defaultValue={bizAvgCustomerValueCents != null ? (bizAvgCustomerValueCents / 100).toFixed(2) : ''}
                  placeholder="180.00"
                  className="admin-input" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Enquiry conversion rate (%)</label>
                <input type="number" name="conversion_rate" step="1" min="0" max="100"
                  defaultValue={bizEnquiryConversionRate ?? ''}
                  placeholder="40"
                  className="admin-input" />
              </div>

              <div className="flex flex-col gap-1.5" style={{ gridColumn: '1 / -1' }}>
                <p className="text-xs" style={{ color: 'var(--t5)' }}>
                  Both admin-only, never client-editable. Used to estimate the &quot;Revenue captured&quot; figure on this client&apos;s dashboard for calls where Ellie sent a booking link (e.g. Timely) instead of booking directly — leave blank to show $0 for that portion until calibrated.
                </p>
              </div>

              <AdminSubmitButton
                pendingLabel="Saving…"
                className="w-full rounded-xl py-3 text-sm font-bold text-white mt-1 transition-opacity hover:opacity-90"
                style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, var(--violet), var(--rose))', boxShadow: '0 0 24px rgba(109,74,255,0.25)' }}>
                Save Changes
              </AdminSubmitButton>
            </div>
          </form>

          {/* Right column: plan/trial + account + danger zone */}
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--b3)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Plan &amp; Trial</h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
                  style={{
                    color: !bizStripeSubscriptionId ? 'var(--t4)' : biz.plan_status === 'trial' ? 'var(--violet)' : biz.plan_status === 'cancelled' ? 'var(--coral)' : 'var(--signal)',
                    background: !bizStripeSubscriptionId ? 'rgba(139,133,160,0.1)' : biz.plan_status === 'trial' ? 'rgba(109,74,255,0.12)' : biz.plan_status === 'cancelled' ? 'rgba(221,81,64,0.1)' : 'rgba(15,163,122,0.1)',
                  }}>
                  {!bizStripeSubscriptionId ? 'not started' : (biz.plan_status ?? 'active')}
                </span>
              </div>
              <div className="p-5 flex flex-col gap-3">
                {!bizStripeSubscriptionId ? (
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                    No subscription yet.{' '}
                    {bizCustomMonthlyPriceCents
                      ? `Send a trial signup link to collect their card and start the ${TRIAL_DAYS}-day free trial — nothing is charged until it ends.`
                      : 'Set a monthly price above first.'}
                  </p>
                ) : biz.plan_status === 'trial' && biz.trial_started_at ? (() => {
                  const timeZone   = biz.timezone ?? 'Australia/Adelaide'
                  const trialStart = new Date(biz.trial_started_at)
                  const trialEnd   = addDaysInZone(trialStart, TRIAL_DAYS, timeZone)
                  const daysLeft   = Math.ceil((trialEnd.getTime() - new Date().getTime()) / (24 * 60 * 60_000))
                  return (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                      Started {formatInZone(trialStart, timeZone, { day: 'numeric', month: 'short' })} — ends{' '}
                      {formatInZone(trialEnd, timeZone, { day: 'numeric', month: 'short' })}
                      {' '}({daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left` : 'ended'}).
                      Card on file — Stripe will automatically charge
                      {bizCustomMonthlyPriceCents ? ` $${(bizCustomMonthlyPriceCents / 100).toFixed(2)}/mo` : ''} when the trial ends.
                      Unlimited calls during the trial, still counted on their dashboard.
                    </p>
                  )
                })() : (
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                    {biz.plan_status === 'cancelled'
                      ? 'This client is cancelled — no active plan.'
                      : `Paying ${bizCustomMonthlyPriceCents ? `$${(bizCustomMonthlyPriceCents / 100).toFixed(2)}/mo` : 'a custom price'} since ${formatInZone(new Date(biz.plan_started_at ?? biz.created_at), biz.timezone ?? 'Australia/Adelaide', { day: 'numeric', month: 'short', year: 'numeric' })}.`}
                  </p>
                )}

                {bizStripeSubscriptionId && (
                  <a href={`${stripeDashboardBase}/subscriptions/${bizStripeSubscriptionId}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium w-fit hover:opacity-80"
                    style={{ color: 'var(--t4)' }}>
                    <ExternalLink size={12} />
                    View subscription in Stripe
                  </a>
                )}

                <div className="flex flex-col gap-2">
                  {/* Cancelling never clears stripe_subscription_id (kept around so
                     "View subscription in Stripe" still points at the record) — so
                     a cancelled client must be offered these same signup links again,
                     not just a client who never had a subscription at all. Checkout
                     always starts a brand-new subscription here regardless of the
                     old cancelled one, and the webhook overwrites stripe_subscription_id
                     with it on completion. */}
                  {(!bizStripeSubscriptionId || biz.plan_status === 'cancelled') ? (
                    bizCustomMonthlyPriceCents ? (
                      <>
                        <form action={sendTrialSignupLinkAction}>
                          <AdminSubmitButton
                            pendingLabel="Sending…"
                            icon={<Sparkles size={13} />}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                            style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.07)', border: '1px solid rgba(109,74,255,0.18)' }}>
                            {bizStripeSubscriptionId ? 'Send New' : `Send ${TRIAL_DAYS}-day`} Trial Signup Link
                          </AdminSubmitButton>
                        </form>
                        <CopyLinkButton
                          action={generateTrialSignupLinkAction.bind(null, bizId, bizName, bizCustomMonthlyPriceCents, clientEmail, bizStripeCustomerId)}
                          label="Copy Trial Signup Link" />
                        <form action={sendPaymentLinkAction}>
                          <AdminSubmitButton
                            pendingLabel="Sending…"
                            icon={<Send size={13} />}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                            style={{ color: 'var(--signal)', background: 'rgba(15,163,122,0.08)', border: '1px solid rgba(15,163,122,0.2)' }}>
                            Send Payment Link (no trial)
                          </AdminSubmitButton>
                        </form>
                      </>
                    ) : null
                  ) : biz.plan_status === 'trial' ? (
                    <>
                      <form action={endTrialNowAction}>
                        <AdminSubmitButton
                          pendingLabel="Charging…"
                          icon={<Zap size={13} />}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                          style={{ color: 'var(--signal)', background: 'rgba(15,163,122,0.08)', border: '1px solid rgba(15,163,122,0.2)' }}>
                          End Trial Now &amp; Charge
                        </AdminSubmitButton>
                      </form>
                      <form action={cancelPlanAction}>
                        <AdminSubmitButton
                          pendingLabel="Cancelling…"
                          icon={<Ban size={13} />}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                          style={{ color: 'var(--coral)', background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)' }}>
                          Cancel Trial
                        </AdminSubmitButton>
                      </form>
                    </>
                  ) : biz.plan_status !== 'cancelled' ? (
                    <form action={cancelPlanAction}>
                      <AdminSubmitButton
                        pendingLabel="Cancelling…"
                        icon={<Ban size={13} />}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={{ color: 'var(--coral)', background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)' }}>
                        Cancel Subscription
                      </AdminSubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--b3)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Account</h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    color: bizAccountDisabled ? 'var(--coral)' : 'var(--signal)',
                    background: bizAccountDisabled ? 'rgba(221,81,64,0.1)' : 'rgba(15,163,122,0.1)',
                  }}>
                  {bizAccountDisabled ? 'Access disabled' : 'Access enabled'}
                </span>
              </div>
              <div className="p-5 flex flex-col gap-2">
                <form action={sendPasswordReset}>
                  <AdminSubmitButton
                    pendingLabel="Sending…"
                    icon={<Mail size={13} />}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-violet-500/10"
                    style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.07)', border: '1px solid rgba(109,74,255,0.18)' }}>
                    Send Password Reset Email
                  </AdminSubmitButton>
                </form>
                <CopyLinkButton action={generateInviteLinkAction.bind(null, bizId, clientEmail)} label="Copy Invite Link" />
                <div className="flex flex-col gap-1.5">
                  <CopyLinkButton
                    action={generateImpersonationLinkAction.bind(null, bizId, userId, clientEmail, bizName)}
                    label="Copy 'View as Client' Link" />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--t5)' }}>
                    Logs straight into their dashboard, bypassing their password entirely. Paste this into a
                    new <strong>Incognito/Private window</strong> — not just a new tab — or it will overwrite
                    your own admin session, since both share the same browser cookies. Expires in ~1 hour and
                    works once.
                  </p>
                  {bizAccountDisabled && (
                    <p className="text-xs" style={{ color: 'var(--coral)' }}>
                      This account&apos;s access is currently disabled — the link will lead to a blocked dashboard until you re-enable it above.
                    </p>
                  )}
                </div>
                <form action={toggleAccountDisabledAction}>
                  <AdminSubmitButton
                    pendingLabel={bizAccountDisabled ? 'Enabling…' : 'Disabling…'}
                    icon={bizAccountDisabled ? <CheckCircle2 size={13} /> : <Ban size={13} />}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={bizAccountDisabled
                      ? { color: 'var(--signal)', background: 'rgba(15,163,122,0.08)', border: '1px solid rgba(15,163,122,0.2)' }
                      : { color: 'var(--coral)', background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)' }}>
                    {bizAccountDisabled ? 'Enable Account Access' : 'Disable Account Access'}
                  </AdminSubmitButton>
                </form>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Dashboard Features</h2>
              </div>
              <form action={updateDashboardFeaturesAction} className="p-5 flex flex-col gap-3">
                {FEATURE_REGISTRY.map(({ key, label, description }) => (
                  <label key={key} className="flex items-start gap-2.5 text-sm cursor-pointer">
                    <input type="checkbox" name={key} defaultChecked={dashboardFeatures[key]} className="mt-0.5" />
                    <span>
                      <span className="font-medium block" style={{ color: 'var(--text)' }}>{label}</span>
                      <span className="text-xs block mt-0.5" style={{ color: 'var(--t3)' }}>{description}</span>
                    </span>
                  </label>
                ))}
                <AdminSubmitButton
                  pendingLabel="Saving…"
                  className="w-full rounded-xl py-2.5 text-sm font-semibold mt-1 transition-all"
                  style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.07)', border: '1px solid rgba(109,74,255,0.18)' }}>
                  Save Features
                </AdminSubmitButton>
              </form>
            </div>

            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Locations</h2>
              </div>
              <div className="p-5 flex flex-col gap-3">
                {locationError === '1' && (
                  <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(221,81,64,0.07)', color: 'var(--coral)' }}>
                    Could not add that location. Please try again.
                  </div>
                )}

                {(siblingLocations ?? []).length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {(siblingLocations ?? []).map(loc => (
                      <Link key={loc.id} href={`/admin/clients/${loc.id}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors btn-ghost"
                        style={{ border: '1px solid var(--b4)', color: 'var(--text)' }}>
                        <span>{loc.name}</span>
                        <span className="capitalize" style={{ color: 'var(--t5)' }}>{loc.plan}</span>
                      </Link>
                    ))}
                  </div>
                )}

                <details className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b4)' }}>
                  <summary className="px-3.5 py-2.5 cursor-pointer text-xs font-semibold select-none list-none flex items-center gap-1.5"
                    style={{ color: 'var(--violet)' }}>
                    <Plus size={12} /> Add another location
                  </summary>
                  <form action={addLocationAction} className="p-3.5 pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--b4)' }}>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Location Name *</label>
                      <input type="text" name="name" required placeholder={`${bizName} — Perth`} className="admin-input" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Phone</label>
                      <input type="tel" name="phone" className="admin-input" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Timezone *</label>
                      <select name="timezone" defaultValue="Australia/Adelaide" className="admin-input admin-select">
                        {AU_TIMEZONES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <p className="text-xs" style={{ color: 'var(--t5)' }}>
                        Set this to where the location actually is — it defaults to Adelaide, not wherever {bizName} itself is.
                      </p>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--t5)' }}>
                      Set a monthly price and send a trial signup link from this location&apos;s own Details tab once it&apos;s created.
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Vapi Assistant ID</label>
                      <input type="text" name="assistant_id" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="admin-input" />
                    </div>
                    <AdminSubmitButton
                      pendingLabel="Adding…"
                      className="w-full rounded-xl py-2.5 text-sm font-bold text-white mt-1 transition-opacity hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}>
                      Add Location
                    </AdminSubmitButton>
                  </form>
                </details>
              </div>
            </div>

            {/* Danger zone — native details for confirmation without JS */}
            <details className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg3)', border: '1px solid rgba(221,81,64,0.18)' }}>
              <summary
                className="px-5 py-4 cursor-pointer flex items-center justify-between select-none list-none"
                style={{ color: 'var(--coral)' }}>
                <span className="text-sm font-semibold">Danger Zone</span>
                <span className="text-xs" style={{ color: 'var(--t4)' }}>expand to delete</span>
              </summary>
              <div className="px-5 pb-5 flex flex-col gap-3"
                style={{ borderTop: '1px solid rgba(221,81,64,0.1)' }}>
                <p className="text-xs pt-4 leading-relaxed" style={{ color: 'var(--t3)' }}>
                  {(siblingLocations ?? []).length > 0 ? (
                    <>
                      Permanently deletes <strong style={{ color: 'var(--t2)' }}>{biz.name}</strong> — this
                      location only. Its appointments are also removed. The client&apos;s login and their other{' '}
                      {(siblingLocations ?? []).length} location{(siblingLocations ?? []).length !== 1 ? 's' : ''} are unaffected.
                      This cannot be undone.
                    </>
                  ) : (
                    <>
                      Permanently deletes <strong style={{ color: 'var(--t2)' }}>{biz.name}</strong> and their
                      login account. All appointments are also removed. This cannot be undone.
                    </>
                  )}
                </p>
                <form action={deleteClient}>
                  <AdminSubmitButton
                    pendingLabel="Deleting…"
                    icon={<Trash2 size={13} />}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-red-500/10"
                    style={{ color: 'var(--coral)', background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)' }}>
                    Delete {biz.name}
                  </AdminSubmitButton>
                </form>
              </div>
            </details>
          </div>
        </div>

        {/* SMS templates — admin-editable, client sees a read-only preview on their own Settings page */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>SMS Templates</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--t5)' }}>
              Sent automatically on booking/reschedule/cancellation, from the phone assistant and from the client&apos;s own
              dashboard. Leave a field blank to use the default shown as its placeholder. The client can see these (read-only)
              on their Settings page, but can&apos;t edit them.
            </p>
            <p className="text-xs mt-2 font-mono" style={{ color: 'var(--t4)' }}>
              Placeholders: {'{{FirstName}}'} {'{{service}}'} {'{{businessName}}'} {'{{dateTime}}'} {'{{duration}}'} {'{{mapsLink}}'} {'{{bookingLink}}'}
              <span style={{ color: 'var(--t5)' }}> (each template only uses the placeholders relevant to it — see the defaults below)</span>
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--t5)' }}>
              Use {'{{FirstName}}'} merge fields to personalise. Messages up to 160 chars = 1 credit. Longer messages split
              into 153-char parts, each costing 1 credit. Messages with emojis or special characters use Unicode encoding
              (70/67 chars) — same cost per part, so avoid them if you want to stay in 1 part.
            </p>
          </div>
          <form action={updateSmsTemplatesAction} className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Booking confirmation</label>
              <textarea name="sms_template_booking" rows={8}
                defaultValue={bizSmsTemplateBooking ?? ''}
                placeholder={SMS_TEMPLATE_DEFAULTS.booking}
                className="admin-input font-mono text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Reschedule confirmation</label>
              <textarea name="sms_template_reschedule" rows={8}
                defaultValue={bizSmsTemplateReschedule ?? ''}
                placeholder={SMS_TEMPLATE_DEFAULTS.reschedule}
                className="admin-input font-mono text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Cancellation confirmation</label>
              <textarea name="sms_template_cancellation" rows={8}
                defaultValue={bizSmsTemplateCancellation ?? ''}
                placeholder={SMS_TEMPLATE_DEFAULTS.cancellation}
                className="admin-input font-mono text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>
                Booking link
                <span className="font-normal" style={{ color: 'var(--t5)' }}> (sendBookingLink tool only)</span>
              </label>
              <textarea name="sms_template_booking_link" rows={8}
                defaultValue={bizSmsTemplateBookingLink ?? ''}
                placeholder={SMS_TEMPLATE_DEFAULTS.bookingLink}
                className="admin-input font-mono text-xs" />
            </div>
            <AdminSubmitButton
              pendingLabel="Saving…"
              className="w-full rounded-xl py-2.5 text-sm font-semibold transition-all"
              style={{ gridColumn: '1 / -1', color: 'var(--violet)', background: 'rgba(109,74,255,0.07)', border: '1px solid rgba(109,74,255,0.18)' }}>
              Save SMS Templates
            </AdminSubmitButton>
          </form>
        </div>
      </div>
    </div>
  )
}
