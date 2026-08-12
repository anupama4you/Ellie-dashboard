import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { TRIAL_DAYS } from '@/lib/planUsage'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AdminSubmitButton from '@/components/AdminSubmitButton'
import { sendEmail } from '@/lib/resend'
import { siteUrl } from '@/lib/siteUrl'

const PLANS = [
  { value: 'starter',      label: 'Starter — 50 calls/mo'       },
  { value: 'core',         label: 'Core — 120 calls/mo'         },
  { value: 'professional', label: 'Professional — 250 calls/mo' },
  { value: 'enterprise',   label: 'Enterprise — 500 calls/mo'   },
  { value: 'unlimited',    label: 'Unlimited — $199/mo'         },
]

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>
}) {
  const { error, detail } = await searchParams

  async function createClientAction(formData: FormData) {
    'use server'
    const admin = createAdminClient()
    const email        = (formData.get('email') as string).trim()
    const businessName = (formData.get('name') as string).trim()

    // Create the user and get a one-time invite token ourselves via
    // generateLink (type: 'invite' creates the auth user exactly like
    // inviteUserByEmail does) rather than letting Supabase's own built-in
    // sender handle it — that sender is rate-limited on every plan tier and
    // is only meant for development. We send the actual email via Resend
    // below instead. `hashed_token` (not `action_link`) is what we want:
    // action_link routes through Supabase's own /auth/v1/verify endpoint,
    // which redirects with the session as a URL *fragment* that a
    // server-side route can't read — same issue documented for the
    // Supabase-template Invite email. Building the link ourselves with
    // token_hash/type as query params lets /auth/callback/route.ts read
    // them via verifyOtp() instead.
    const { data: linkData, error: inviteErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${await siteUrl()}/auth/callback?next=/auth/set-password`,
        data: { business_name: businessName },
      },
    })
    const user = linkData?.user
    const hashedToken = linkData?.properties?.hashed_token
    if (inviteErr || !user || !hashedToken) {
      // The old copy here just assumed "already registered" for every failure —
      // that's wrong often enough (rate limits, SMTP issues, bad redirect URL)
      // to be actively misleading, so surface what Supabase actually said.
      redirect(`/admin/clients/new?error=user&detail=${encodeURIComponent(inviteErr?.message ?? 'Unknown error')}`)
    }

    const startTrial = formData.get('start_trial') === 'on'
    const now = new Date().toISOString()

    const { data: biz, error: bizErr } = await admin.from('businesses').insert({
      user_id:           user.id,
      name:              businessName,
      phone:             (formData.get('phone') as string).trim() || null,
      plan:              formData.get('plan') as string,
      vapi_assistant_id: (formData.get('assistant_id') as string).trim() || null,
      plan_status:       startTrial ? 'trial' : 'active',
      trial_started_at:  startTrial ? now : null,
      plan_started_at:   now,
    }).select('id').single()

    if (bizErr || !biz) {
      await admin.auth.admin.deleteUser(user.id)
      redirect('/admin/clients/new?error=biz')
    }

    const inviteUrl = `${await siteUrl()}/auth/callback?next=/auth/set-password&token_hash=${hashedToken}&type=invite`
    let emailWarning = false
    try {
      await sendEmail(email, `You're invited to set up ${businessName} on Ellie`, `
        <p>Hi,</p>
        <p>You've been invited to manage <strong>${businessName}</strong>'s Ellie dashboard.</p>
        <p><a href="${inviteUrl}">Click here to set your password and get started</a></p>
        <p>If the link doesn't work, copy and paste this URL into your browser:<br>${inviteUrl}</p>
      `)
    } catch (emailErr) {
      // The account and business record are already created — don't throw
      // that work away over a delivery hiccup. Surface it to the admin
      // instead so they know to follow up (e.g. via "Send Password Reset
      // Email" on the client's Details tab, which goes through this same
      // Resend path and gives the client a fresh working link).
      console.error('Failed to send invite email via Resend:', emailErr)
      emailWarning = true
    }

    // Straight into the System Prompt tab for the new client — that's where
    // Ellie's actual live behaviour gets set up.
    redirect(`/admin/clients/${biz.id}/prompt?created=1${emailWarning ? '&emailWarning=1' : ''}`)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-lg mx-auto flex flex-col gap-5">

        {/* Back + title */}
        <div className="flex items-center gap-3">
          <Link href="/admin/clients"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors btn-ghost shrink-0"
            style={{ color: 'var(--t3)' }}>
            <ArrowLeft size={14} />
          </Link>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Add New Client</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--t6)' }}>
              An invitation email is sent so the client can set their own password. You&apos;ll set up Ellie&apos;s Briefing right after.
            </p>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)', color: 'var(--coral)' }}>
            {error === 'user'
              ? `Could not create account — ${detail || 'that email may already be registered.'}`
              : 'Account created but business record failed. Please try again.'}
          </div>
        )}

        <form action={createClientAction}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>

          {/* Gradient top line */}
          <div className="relative px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(109,74,255,0.35), transparent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Client Details</h2>
          </div>

          <div className="p-5 flex flex-col gap-4">

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Email *</label>
              <input type="email" name="email" required
                placeholder="client@theirbusiness.com.au"
                className="admin-input" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Business Name *</label>
              <input type="text" name="name" required
                placeholder="Adelaide Hair Studio"
                className="admin-input" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Phone</label>
              <input type="tel" name="phone"
                placeholder="+61 8 1234 5678"
                className="admin-input" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Plan *</label>
              <select name="plan" defaultValue="core" className="admin-input admin-select">
                {PLANS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p className="text-xs" style={{ color: 'var(--t6)' }}>
                Which plan this converts to once the trial ends (if starting one below) — call limits don&apos;t apply until then.
              </p>
            </div>

            <label className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl cursor-pointer"
              style={{ background: 'rgba(109,74,255,0.06)', border: '1px solid rgba(109,74,255,0.18)' }}>
              <input type="checkbox" name="start_trial" defaultChecked
                className="mt-0.5" style={{ accentColor: 'var(--violet)' }} />
              <span>
                <span className="text-xs font-semibold block" style={{ color: 'var(--text)' }}>
                  Start {TRIAL_DAYS}-day free trial
                </span>
                <span className="text-xs" style={{ color: 'var(--t5)' }}>
                  Unlimited calls during the trial (still counted on the dashboard). Payments are handled separately — convert or cancel from the client&apos;s Details tab once they decide.
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Vapi Assistant ID</label>
              <input type="text" name="assistant_id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="admin-input" />
              <p className="text-xs" style={{ color: 'var(--t6)' }}>
                Can be set later — client won&apos;t have call data until this is assigned.
              </p>
            </div>

            <AdminSubmitButton
              pendingLabel="Creating client…"
              className="w-full rounded-xl py-3 text-sm font-bold text-white mt-1 transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))', boxShadow: '0 0 24px rgba(109,74,255,0.25)' }}>
              Create Client &amp; Continue to Briefing
            </AdminSubmitButton>

          </div>
        </form>
      </div>
    </div>
  )
}
