import Link from 'next/link'
import { getCurrentBusiness } from '@/lib/business'
import { getLocalCalls, type LocalCall } from '@/lib/calls'
import { classifyCall, callTypeLabel } from '@/lib/callClassify'
import { formatInZone } from '@/lib/timezone'
import { PhoneOff, Search } from 'lucide-react'
import CallsExplorer, { type CallItem } from '@/components/CallsExplorer'

function fmtTime(iso: string, timeZone: string) {
  const d = new Date(iso)
  return {
    date: formatInZone(d, timeZone, { day: 'numeric', month: 'short', year: 'numeric' }),
    time: formatInZone(d, timeZone, { hour: '2-digit', minute: '2-digit' }),
  }
}

// Search/filter/sort in CallsExplorer runs over whatever's fetched here, so
// this stays generous enough to cover recent history — just not the whole
// table, which was the actual slow part.
const BATCH_SIZE = 75
const DATE_RANGE_LIMIT = 150

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from, to } = await searchParams
  const hasDateFilter = Boolean(from || to)

  const { business: biz } = await getCurrentBusiness()
  const timeZone = biz?.timezone ?? 'Australia/Adelaide'

  let rawCalls: LocalCall[] = []
  let fetchError: string | null = null

  if (!biz) {
    fetchError = 'No business profile found.'
  } else if (!biz.vapi_assistant_id) {
    fetchError = 'No Vapi Assistant ID set on your business profile.'
  } else {
    try {
      rawCalls = await getLocalCalls(biz.id, {
        limit: hasDateFilter ? DATE_RANGE_LIMIT : BATCH_SIZE,
        dateRange: hasDateFilter ? { from, to, timeZone } : undefined,
      })
    } catch (err) {
      console.error('Failed to fetch local calls:', err)
      fetchError = 'Could not load calls — please try again shortly.'
    }
  }

  const calls: CallItem[] = rawCalls.map(call => {
    const { category, label, color, bg } = classifyCall(call.ended_reason ?? undefined)
    const dt = call.started_at ? fmtTime(call.started_at, timeZone) : null
    // Web calls have no phone number on either end; real phone calls answer on the business's Ellie number.
    const assistantNumber = call.assistant_phone || (call.call_type !== 'webCall' ? biz?.phone ?? undefined : undefined)
    return {
      id: call.id,
      type: call.call_type ?? undefined,
      typeLabel: callTypeLabel(call.call_type ?? undefined),
      assistantNumber: assistantNumber ?? undefined,
      customerNumber: call.caller_phone ?? undefined,
      customerName: call.caller_name ?? undefined,
      startedAtIso: call.started_at ?? undefined,
      startedDate: dt?.date,
      startedTime: dt?.time,
      durationSecs: call.duration_seconds ?? 0,
      summary: call.summary ?? undefined,
      category,
      badgeLabel: label,
      badgeColor: color,
      badgeBg: bg,
      recordingUrl: call.recording_url ?? undefined,
      hasTranscript: !!call.transcript,
    }
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
              Calls
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Every call Ellie has answered, recorded and transcribed
            </p>
          </div>

          {/* Date range filter — plain GET form, no client JS needed */}
          <form
            className="flex items-end gap-2 flex-wrap"
            action="/calls"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>From</span>
              <input
                type="date"
                name="from"
                defaultValue={from ?? ''}
                className="text-sm rounded-lg px-2.5 py-1.5"
                style={{ border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--card)' }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>To</span>
              <input
                type="date"
                name="to"
                defaultValue={to ?? ''}
                className="text-sm rounded-lg px-2.5 py-1.5"
                style={{ border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--card)' }}
              />
            </label>
            <button
              type="submit"
              className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-lg text-white"
              style={{ background: 'var(--violet)' }}
            >
              <Search size={13} /> Search
            </button>
            {hasDateFilter && (
              <Link
                href="/calls"
                className="text-sm font-semibold px-3.5 py-1.5 rounded-lg"
                style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
              >
                Clear
              </Link>
            )}
          </form>
        </div>

        {fetchError ? (
          <div
            className="rounded-2xl py-12 text-center px-6 flex flex-col items-center gap-2"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--coral-soft)' }}>
              <PhoneOff size={16} style={{ color: 'var(--coral)' }} />
            </div>
            <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>Setup required</p>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{fetchError}</p>
          </div>
        ) : (
          <CallsExplorer calls={calls} />
        )}
      </div>
    </div>
  )
}
