import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { PhoneCall, CalendarDays, MessageSquare, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDashboardFeatures } from '@/lib/dashboardFeatures'
import { calendarHealthFromRow, getLiveVapiHealth } from '@/lib/clientHealth'
import AdminClientHeader from '@/components/AdminClientHeader'

const STATUS_STYLE = {
  ok:    { color: 'var(--signal)', bg: 'rgba(15,163,122,0.1)',  icon: CheckCircle2 },
  warn:  { color: 'var(--amber)',  bg: 'rgba(217,138,11,0.12)', icon: AlertTriangle },
  error: { color: 'var(--coral)',  bg: 'rgba(221,81,64,0.1)',   icon: XCircle },
}

function StatusBadge({ tone, label }: { tone: keyof typeof STATUS_STYLE; label: string }) {
  const { color, bg, icon: Icon } = STATUS_STYLE[tone]
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 w-fit" style={{ color, background: bg }}>
      <Icon size={12} />
      {label}
    </span>
  )
}

function HealthCard({ icon: Icon, title, children }: { icon: typeof PhoneCall; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: '1px solid var(--b3)' }}>
        <Icon size={15} style={{ color: 'var(--t3)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
      </div>
      <div className="p-5 flex flex-col gap-3">{children}</div>
    </div>
  )
}

export default async function AdminClientHealthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: biz } = await admin.from('businesses').select('*').eq('id', id).single()
  if (!biz) redirect('/admin/clients')

  const [{ data: { user: clientUser } }, { data: calendarRow }, vapiHealth] = await Promise.all([
    admin.auth.admin.getUserById(biz.user_id),
    admin.from('calendar_connections').select('status, token_expiry, google_email').eq('business_id', biz.id).maybeSingle(),
    getLiveVapiHealth(biz.vapi_assistant_id),
  ])

  const features = resolveDashboardFeatures(biz)
  const calendarHealth = calendarHealthFromRow(calendarRow)

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">

        <AdminClientHeader
          id={biz.id}
          name={biz.name}
          email={clientUser?.email ?? ''}
          plan={biz.plan}
          planStatus={biz.plan_status}
          hasAssistant={!!biz.vapi_assistant_id}
          active="health"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          <HealthCard icon={PhoneCall} title="Vapi Assistant">
            {vapiHealth === 'no_assistant' && (
              <>
                <StatusBadge tone="error" label="No assistant configured" />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                  This business has no Vapi Assistant ID set — Ellie can&apos;t answer any calls for them at all yet.
                </p>
              </>
            )}
            {vapiHealth === 'error' && (
              <>
                <StatusBadge tone="error" label="Couldn't reach Vapi" />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                  Failed to load the live assistant config — check the assistant ID is still valid, or try again shortly.
                </p>
              </>
            )}
            {vapiHealth === 'no_server_url' && (
              <>
                <StatusBadge tone="warn" label="Webhook not configured" />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                  This assistant has no <code>server.url</code> set, so Vapi never sends <code>end-of-call-report</code>.
                  Live calls still work fine, but the local <code>calls</code> table stays empty — Monthly plan usage
                  will read wrong, and past calls made before this is fixed can&apos;t be backfilled. Fixed by any
                  prompt save/apply from the System Prompt tab (requires <code>APP_URL</code> to be set).
                </p>
              </>
            )}
            {vapiHealth === 'ok' && (
              <StatusBadge tone="ok" label="Connected & configured" />
            )}
            {biz.vapi_assistant_id && (
              <p className="text-xs font-mono truncate" style={{ color: 'var(--t5)' }}>{biz.vapi_assistant_id}</p>
            )}
          </HealthCard>

          <HealthCard icon={CalendarDays} title="Google Calendar">
            {calendarHealth === 'not_connected' && (
              <>
                <StatusBadge tone="warn" label="Not connected" />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                  No calendar linked — availability falls back to local business hours and existing appointments only.
                  Completely fine if they never asked for live Google sync.
                </p>
              </>
            )}
            {calendarHealth === 'connected' && (
              <StatusBadge tone="ok" label="Connected" />
            )}
            {(calendarHealth === 'expired' || calendarHealth === 'error') && (
              <>
                <StatusBadge tone="error" label={calendarHealth === 'expired' ? 'Token expired' : 'Connection error'} />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                  A calendar connection exists but isn&apos;t working — real free/busy checks and event creation have
                  silently stopped, and bookings are falling back to local-only availability. The client needs to
                  reconnect Google Calendar from their Integrations page.
                </p>
              </>
            )}
            {calendarRow?.google_email && (
              <p className="text-xs" style={{ color: 'var(--t5)' }}>{calendarRow.google_email}</p>
            )}
          </HealthCard>

          <HealthCard icon={MessageSquare} title="Twilio / SMS">
            {!features.sms ? (
              <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                The Messages dashboard feature is turned off for this client — SMS confirmations still send on
                booking regardless, as long as a number is set below.
              </p>
            ) : biz.twilio_phone_number ? (
              <StatusBadge tone="ok" label="Number configured" />
            ) : (
              <>
                <StatusBadge tone="error" label="No number set" />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>
                  Messages is enabled but there&apos;s no Twilio number on file — booking confirmations can&apos;t
                  send, and the Messages inbox will be empty. Set it from the Details tab.
                </p>
              </>
            )}
            {biz.twilio_phone_number && (
              <p className="text-xs font-mono" style={{ color: 'var(--t5)' }}>{biz.twilio_phone_number}</p>
            )}
          </HealthCard>

        </div>
      </div>
    </div>
  )
}
