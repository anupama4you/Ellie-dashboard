import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { Mail, Trash2, CheckCircle2, Sparkles, Send, Ban, ExternalLink, AlertTriangle } from 'lucide-react'
import { TRIAL_DAYS } from '@/lib/planUsage'
import { addDaysInZone, formatInZone } from '@/lib/timezone'
import AdminClientHeader from '@/components/AdminClientHeader'
import AdminSubmitButton from '@/components/AdminSubmitButton'
import CopyLinkButton from '@/components/CopyLinkButton'
import { generateInviteLinkAction, generatePaymentLinkAction } from './actions'
import { sendEmail } from '@/lib/resend'
import { siteUrl } from '@/lib/siteUrl'

const PLANS = [
  { value: 'starter',      label: 'Starter — 50 calls/mo'       },
  { value: 'core',         label: 'Core — 120 calls/mo'         },
  { value: 'professional', label: 'Professional — 250 calls/mo' },
  { value: 'enterprise',   label: 'Enterprise — 500 calls/mo'   },
  { value: 'unlimited',    label: 'Unlimited — $199/mo'         },
]

const TIMEZONES = [
  { value: 'Australia/Sydney',      label: 'Sydney / Melbourne / Canberra (AEST/AEDT)' },
  { value: 'Australia/Brisbane',    label: 'Brisbane (AEST, no DST)' },
  { value: 'Australia/Adelaide',    label: 'Adelaide (ACST/ACDT)' },
  { value: 'Australia/Darwin',      label: 'Darwin (ACST, no DST)' },
  { value: 'Australia/Perth',       label: 'Perth (AWST, no DST)' },
  { value: 'Australia/Hobart',      label: 'Hobart (AEST/AEDT)' },
  { value: 'Australia/Broken_Hill', label: 'Broken Hill (ACST/ACDT)' },
  { value: 'Australia/Lord_Howe',   label: 'Lord Howe Island' },
]

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ reset?: string; saved?: string; paymentLink?: string }>
}) {
  const { id }                       = await params
  const { reset, saved, paymentLink } = await searchParams

  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('*').eq('id', id).single()
  if (!biz) redirect('/admin/clients')

  const { data: { user: clientUser } } = await admin.auth.admin.getUserById(biz.user_id)
  const clientEmail = clientUser?.email ?? ''

  // Capture only the primitives the server actions need
  const bizId                    = biz.id
  const userId                   = biz.user_id
  const bizName                  = biz.name as string
  const bizPlan                  = biz.plan as string
  const bizStripeCustomerId      = biz.stripe_customer_id as string | null
  const bizStripeSubscriptionId  = biz.stripe_subscription_id as string | null
  const bizAccountDisabled       = biz.account_disabled as boolean

  // Test-mode keys (sk_test_...) and live keys (sk_live_...) each have their
  // own dashboard — get this wrong and the "View in Stripe" link 404s.
  const stripeDashboardBase = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')
    ? 'https://dashboard.stripe.com'
    : 'https://dashboard.stripe.com/test'

  async function updateBusiness(formData: FormData) {
    'use server'
    const admin = createAdminClient()

    const newEmail = (formData.get('email') as string).trim()
    if (newEmail && newEmail !== clientEmail) {
      await admin.auth.admin.updateUserById(userId, { email: newEmail })
    }

    await admin.from('businesses').update({
      name:                (formData.get('name') as string).trim(),
      phone:               (formData.get('phone') as string).trim() || null,
      plan:                formData.get('plan') as string,
      vapi_assistant_id:   (formData.get('assistant_id') as string).trim() || null,
      twilio_phone_number: (formData.get('twilio_phone_number') as string).trim() || null,
      timezone:            formData.get('timezone') as string,
    }).eq('id', bizId)

    redirect(`/admin/clients/${bizId}?saved=1`)
  }

  async function sendPasswordReset() {
    'use server'
    const admin = createAdminClient()

    // Generate the link ourselves and send via Resend rather than Supabase's
    // /auth/v1/recover, which goes through Supabase's built-in email sender
    // — rate-limited on every plan tier. Same token_hash/type query-param
    // approach as the invite flow, so /auth/callback/route.ts's verifyOtp()
    // can read it directly instead of hitting Supabase's fragment-redirecting
    // /auth/v1/verify endpoint.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: clientEmail,
      options: { redirectTo: `${await siteUrl()}/auth/callback?next=/auth/set-password` },
    })
    const hashedToken = linkData?.properties?.hashed_token
    if (linkErr || !hashedToken) {
      console.error('Failed to generate password reset link:', linkErr)
      redirect(`/admin/clients/${bizId}?reset=error`)
    }

    const resetUrl = `${await siteUrl()}/auth/callback?next=/auth/set-password&token_hash=${hashedToken}&type=recovery`
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

    redirect(`/admin/clients/${bizId}?reset=sent`)
  }

  async function deleteClient() {
    'use server'
    const admin = createAdminClient()
    await admin.from('businesses').delete().eq('id', bizId)
    await admin.auth.admin.deleteUser(userId)
    redirect('/admin/clients')
  }

  /** Starts (or restarts, e.g. after a cancellation) a fresh trial — resets the billing anchor to now. */
  async function startTrialAction() {
    'use server'
    const admin = createAdminClient()
    const now = new Date().toISOString()
    await admin.from('businesses').update({ plan_status: 'trial', trial_started_at: now, plan_started_at: now }).eq('id', bizId)
    redirect(`/admin/clients/${bizId}?saved=1`)
  }

  /**
   * Trial → paid never flips plan_status itself — that only happens once
   * Stripe confirms the subscription was actually created, via
   * api/stripe-webhook's `checkout.session.completed` handler. This just
   * creates the Checkout Session the client needs to complete themselves
   * (via the shared generatePaymentLinkAction, same one CopyLinkButton
   * uses) and emails it to them; success/cancel redirect to their own
   * dashboard, not the admin panel, since it's their browser that ends up
   * there.
   */
  async function sendPaymentLinkAction() {
    'use server'
    if (!clientEmail) redirect(`/admin/clients/${bizId}?paymentLink=error`)

    const result = await generatePaymentLinkAction(bizId, bizName, bizPlan, clientEmail, bizStripeCustomerId)
    if ('error' in result) {
      console.error('Failed to create payment link:', result.error)
      redirect(`/admin/clients/${bizId}?paymentLink=error`)
    }

    try {
      await sendEmail(clientEmail, `Set up payment for ${bizName} on Ellie`, `
        <p>Hi,</p>
        <p>Click the link below to set up payment for your ${bizPlan} plan on Ellie.</p>
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
    const admin = createAdminClient()

    if (bizStripeSubscriptionId) {
      try {
        await getStripe().subscriptions.cancel(bizStripeSubscriptionId)
      } catch (err) {
        console.error('Failed to cancel Stripe subscription — marking cancelled locally anyway:', err)
      }
    }

    await admin.from('businesses').update({ plan_status: 'cancelled' }).eq('id', bizId)
    redirect(`/admin/clients/${bizId}?saved=1`)
  }

  /** The one real access gate — see (dashboard)/layout.tsx. Unlike plan_status, this actually blocks the client's dashboard. */
  async function toggleAccountDisabledAction() {
    'use server'
    const admin = createAdminClient()
    await admin.from('businesses').update({ account_disabled: !bizAccountDisabled }).eq('id', bizId)
    redirect(`/admin/clients/${bizId}?saved=1`)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
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
            Couldn&apos;t send the payment link — check the server logs, or use &quot;Copy Payment Link&quot; instead.
          </div>
        )}

        <div className="grid gap-5" style={{ gridTemplateColumns: '1.4fr 1fr' }}>

          {/* Edit form */}
          <form action={updateBusiness}
            className="rounded-2xl overflow-hidden h-fit"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>

            <div className="relative px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(109,74,255,0.35), transparent)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Client details</h2>
            </div>

            <div className="p-5 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Plan</label>
                <select name="plan" defaultValue={biz.plan} className="admin-input admin-select">
                  {PLANS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5" style={{ gridColumn: '1 / -1' }}>
                <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Timezone</label>
                <select name="timezone" defaultValue={biz.timezone ?? 'Australia/Adelaide'} className="admin-input admin-select">
                  {TIMEZONES.map(t => (
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
                    color: biz.plan_status === 'trial' ? 'var(--violet)' : biz.plan_status === 'cancelled' ? 'var(--coral)' : 'var(--signal)',
                    background: biz.plan_status === 'trial' ? 'rgba(109,74,255,0.12)' : biz.plan_status === 'cancelled' ? 'rgba(221,81,64,0.1)' : 'rgba(15,163,122,0.1)',
                  }}>
                  {biz.plan_status ?? 'active'}
                </span>
              </div>
              <div className="p-5 flex flex-col gap-3">
                {biz.plan_status === 'trial' && biz.trial_started_at ? (() => {
                  const timeZone   = biz.timezone ?? 'Australia/Adelaide'
                  const trialStart = new Date(biz.trial_started_at)
                  const trialEnd   = addDaysInZone(trialStart, TRIAL_DAYS, timeZone)
                  const daysLeft   = Math.ceil((trialEnd.getTime() - new Date().getTime()) / (24 * 60 * 60_000))
                  return (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                      Started {formatInZone(trialStart, timeZone, { day: 'numeric', month: 'short' })} — ends{' '}
                      {formatInZone(trialEnd, timeZone, { day: 'numeric', month: 'short' })}
                      {' '}({daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left` : 'ended'}).
                      Unlimited calls during the trial, still counted on their dashboard.
                    </p>
                  )
                })() : (
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                    {biz.plan_status === 'cancelled'
                      ? 'This client is cancelled — no active plan.'
                      : `On the ${biz.plan} plan since ${formatInZone(new Date(biz.plan_started_at ?? biz.created_at), biz.timezone ?? 'Australia/Adelaide', { day: 'numeric', month: 'short', year: 'numeric' })}.`}
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
                  {biz.plan_status === 'trial' ? (
                    <>
                      <form action={sendPaymentLinkAction}>
                        <AdminSubmitButton
                          pendingLabel="Sending…"
                          icon={<Send size={13} />}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                          style={{ color: 'var(--signal)', background: 'rgba(15,163,122,0.08)', border: '1px solid rgba(15,163,122,0.2)' }}>
                          Send Payment Link ({biz.plan})
                        </AdminSubmitButton>
                      </form>
                      <CopyLinkButton
                        action={generatePaymentLinkAction.bind(null, bizId, bizName, bizPlan, clientEmail, bizStripeCustomerId)}
                        label="Copy Payment Link" />
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
                  ) : (
                    <form action={startTrialAction}>
                      <AdminSubmitButton
                        pendingLabel="Starting trial…"
                        icon={<Sparkles size={13} />}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.07)', border: '1px solid rgba(109,74,255,0.18)' }}>
                        Start {TRIAL_DAYS}-day Trial
                      </AdminSubmitButton>
                    </form>
                  )}
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
                <CopyLinkButton action={generateInviteLinkAction.bind(null, clientEmail)} label="Copy Invite Link" />
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
                  Permanently deletes <strong style={{ color: 'var(--t2)' }}>{biz.name}</strong> and their
                  login account. All appointments are also removed. This cannot be undone.
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
      </div>
    </div>
  )
}
