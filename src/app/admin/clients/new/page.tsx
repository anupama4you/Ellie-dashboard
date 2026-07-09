import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/**
 * NEXT_PUBLIC_SITE_URL wins when set — trust the environment over guessing.
 * Otherwise fall back to the request's own host/protocol (respecting
 * x-forwarded-proto behind a reverse proxy). Defaults to http rather than
 * https for unrecognized hosts, since this app is also served plain-http on
 * a custom domain, not just localhost.
 */
async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const protocol = h.get('x-forwarded-proto') ?? 'http'
  return `${protocol}://${host}`
}

const PLANS = [
  { value: 'starter',      label: 'Starter — 50 calls/mo'       },
  { value: 'core',         label: 'Core — 120 calls/mo'         },
  { value: 'professional', label: 'Professional — 250 calls/mo' },
  { value: 'enterprise',   label: 'Enterprise — 500 calls/mo'   },
]

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  async function createClientAction(formData: FormData) {
    'use server'
    const admin = createAdminClient()
    const email        = (formData.get('email') as string).trim()
    const businessName = (formData.get('name') as string).trim()

    // Invite user — Supabase sends an email with a set-password link that
    // lands on /auth/set-password after the invite session is established.
    // business_name feeds {{ .Data.business_name }} in the Invite email template.
    const { data: { user }, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${await siteUrl()}/auth/callback?next=/auth/set-password`,
      data: { business_name: businessName },
    })
    if (inviteErr || !user) redirect('/admin/clients/new?error=user')

    const { data: biz, error: bizErr } = await admin.from('businesses').insert({
      user_id:           user.id,
      name:              businessName,
      phone:             (formData.get('phone') as string).trim() || null,
      plan:              formData.get('plan') as string,
      vapi_assistant_id: (formData.get('assistant_id') as string).trim() || null,
    }).select('id').single()

    if (bizErr || !biz) {
      await admin.auth.admin.deleteUser(user.id)
      redirect('/admin/clients/new?error=biz')
    }

    // Straight into the System Prompt tab for the new client — that's where
    // Ellie's actual live behaviour gets set up.
    redirect(`/admin/clients/${biz.id}/prompt?created=1`)
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
              ? 'Could not create account — that email may already be registered.'
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
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Vapi Assistant ID</label>
              <input type="text" name="assistant_id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="admin-input" />
              <p className="text-xs" style={{ color: 'var(--t6)' }}>
                Can be set later — client won&apos;t have call data until this is assigned.
              </p>
            </div>

            <button type="submit"
              className="w-full rounded-xl py-3 text-sm font-bold text-white mt-1 transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))', boxShadow: '0 0 24px rgba(109,74,255,0.25)' }}>
              Create Client &amp; Continue to Briefing
            </button>

          </div>
        </form>
      </div>
    </div>
  )
}
