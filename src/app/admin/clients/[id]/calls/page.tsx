import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PhoneOff, Search } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocalCallsList, callSummaryPreview, type LocalCallListItem } from '@/lib/calls'
import { classifyCall } from '@/lib/callClassify'
import { formatInZone } from '@/lib/timezone'
import { isAfterHours } from '@/lib/availability'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import type { Hours } from '@/lib/promptSections'
import AdminClientHeader from '@/components/AdminClientHeader'
import CallsExplorer, { type CallItem } from '@/components/CallsExplorer'

function fmtTime(iso: string, timeZone: string) {
  const d = new Date(iso)
  return {
    date: formatInZone(d, timeZone, { day: 'numeric', month: 'short', year: 'numeric' }),
    time: formatInZone(d, timeZone, { hour: '2-digit', minute: '2-digit' }),
  }
}

// Same bounds as the client-facing Calls page (src/app/(dashboard)/calls/page.tsx) this mirrors.
const BATCH_SIZE = 75
const DATE_RANGE_LIMIT = 150

export default async function AdminClientCallsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { id } = await params
  const { from, to } = await searchParams
  const hasDateFilter = Boolean(from || to)

  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('*').eq('id', id).single()
  if (!biz) redirect('/admin/clients')

  const { data: { user: clientUser } } = await admin.auth.admin.getUserById(biz.user_id)
  const timeZone = biz.timezone ?? 'Australia/Adelaide'

  let rawCalls: LocalCallListItem[] = []
  let fetchError: string | null = null

  if (!biz.vapi_assistant_id) {
    fetchError = 'No Vapi Assistant ID set for this business yet.'
  } else {
    try {
      rawCalls = await getLocalCallsList(biz.id, {
        limit: hasDateFilter ? DATE_RANGE_LIMIT : BATCH_SIZE,
        dateRange: hasDateFilter ? { from, to, timeZone } : undefined,
        client: admin,
      })
    } catch (err) {
      console.error('Failed to fetch local calls for admin:', err)
      fetchError = 'Could not load calls — please try again shortly.'
    }
  }

  const bizHours = (biz.hours as Hours | undefined) ?? null
  const calls: CallItem[] = rawCalls.map(call => {
    const { category, label, color, bg } = classifyCall(
      call.ended_reason ?? undefined,
      call.outcome === 'booked' || call.outcome === 'rebooked',
      call.outcome === 'rebooked',
      call.outcome === 'linked',
      call.outcome === 'declined',
      call.outcome === 'reviewRequested',
      call.outcome === 'callbackRequested',
    )
    const dt = call.started_at ? fmtTime(call.started_at, timeZone) : null
    const summaryPreview = category === 'missed' ? 'Missed call' : callSummaryPreview(call).text
    return {
      id: call.id,
      customerNumber: call.caller_phone ?? undefined,
      customerName: call.caller_name ?? undefined,
      startedAtIso: call.started_at ?? undefined,
      startedDate: dt?.date,
      startedTime: dt?.time,
      durationSecs: call.duration_seconds ?? 0,
      category,
      badgeLabel: label,
      badgeColor: color,
      badgeBg: bg,
      summaryPreview,
      isAfterHours: call.started_at ? isAfterHours(new Date(call.started_at), bizHours, timeZone) : false,
      isOutbound: call.call_type === 'outboundPhoneCall',
    }
  })

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-[1220px] mx-auto flex flex-col gap-4 h-full">
        <AdminClientHeader
          id={biz.id}
          name={biz.name}
          email={clientUser?.email ?? ''}
          plan={biz.plan}
          planStatus={biz.plan_status}
          hasAssistant={!!biz.vapi_assistant_id}
          active="calls"
        />

        <div className="flex items-end justify-between gap-4 flex-wrap shrink-0">
          <p className="text-sm" style={{ color: 'var(--t3)' }}>
            Every call Ellie has answered for this business, recorded and transcribed
          </p>

          <form className="flex items-center gap-1.5 flex-wrap" action={`/admin/clients/${biz.id}/calls`}>
            <input
              type="date"
              name="from"
              aria-label="From date"
              defaultValue={from ?? ''}
              className="text-sm rounded-lg px-2 py-1.5 min-w-0 w-[132px]"
              style={{ border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--bg3)' }}
            />
            <span className="text-xs shrink-0" style={{ color: 'var(--t3)' }}>to</span>
            <input
              type="date"
              name="to"
              aria-label="To date"
              defaultValue={to ?? ''}
              className="text-sm rounded-lg px-2 py-1.5 min-w-0 w-[132px]"
              style={{ border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--bg3)' }}
            />
            <button
              type="submit"
              aria-label="Search"
              className="flex items-center gap-1.5 text-sm font-semibold px-2.5 sm:px-3.5 py-1.5 rounded-lg text-white shrink-0"
              style={{ background: 'var(--violet)' }}
            >
              <Search size={13} /> <span className="hidden sm:inline">Search</span>
            </button>
            {hasDateFilter && (
              <Link
                href={`/admin/clients/${biz.id}/calls`}
                className="text-sm font-semibold px-2.5 sm:px-3.5 py-1.5 rounded-lg shrink-0"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                Clear
              </Link>
            )}
          </form>
        </div>

        <div className="flex-1 min-h-0">
          {fetchError ? (
            <div
              className="rounded-2xl py-12 text-center px-6 flex flex-col items-center gap-2"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(221,81,64,0.1)' }}>
                <PhoneOff size={16} style={{ color: 'var(--coral)' }} />
              </div>
              <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>Setup required</p>
              <p className="text-sm" style={{ color: 'var(--t3)' }}>{fetchError}</p>
            </div>
          ) : (
            <CallsExplorer
              calls={calls}
              timeZone={timeZone}
              showOutbound={isFeatureEnabled(biz, 'campaigns')}
              adminBusinessId={biz.id}
            />
          )}
        </div>
      </div>
    </div>
  )
}
