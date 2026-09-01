import Link from 'next/link'
import { getCurrentBusiness } from '@/lib/business'
import { getLocalCallsList, type LocalCallListItem } from '@/lib/calls'
import { classifyCall } from '@/lib/callClassify'
import { formatInZone } from '@/lib/timezone'
import { isAfterHours } from '@/lib/availability'
import { PhoneOff, Search } from 'lucide-react'
import CallsExplorer, { type CallItem } from '@/components/CallsExplorer'
import type { Hours } from '@/app/(dashboard)/briefing/actions'

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

  let rawCalls: LocalCallListItem[] = []
  let fetchError: string | null = null

  if (!biz) {
    fetchError = 'No business profile found.'
  } else if (!biz.vapi_assistant_id) {
    fetchError = 'No Vapi Assistant ID set on your business profile.'
  } else {
    try {
      rawCalls = await getLocalCallsList(biz.id, {
        limit: hasDateFilter ? DATE_RANGE_LIMIT : BATCH_SIZE,
        dateRange: hasDateFilter ? { from, to, timeZone } : undefined,
      })
    } catch (err) {
      console.error('Failed to fetch local calls:', err)
      fetchError = 'Could not load calls — please try again shortly.'
    }
  }

  const bizHours = (biz?.hours as Hours | undefined) ?? null
  // Only the fields needed for the list row — summary, transcript and the
  // recording are fetched lazily per-call by CallDetailPane once selected.
  const calls: CallItem[] = rawCalls.map(call => {
    const { category, label, color, bg } = classifyCall(call.ended_reason ?? undefined, call.outcome === 'booked' || call.outcome === 'rebooked', call.outcome === 'rebooked', call.outcome === 'linked')
    const dt = call.started_at ? fmtTime(call.started_at, timeZone) : null
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
      isAfterHours: call.started_at ? isAfterHours(new Date(call.started_at), bizHours, timeZone) : false,
    }
  })

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-3 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 max-w-[1220px] w-full mx-auto flex flex-col gap-3 sm:gap-4 shrink-0">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
              Calls
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Every call Ellie has answered, recorded and transcribed
            </p>
          </div>

          {/* Date range filter — plain GET form, no client JS needed. Labels
             are aria-only on small screens so the row stays compact. */}
          <form
            className="flex items-center gap-1.5 flex-wrap"
            action="/calls"
          >
            <input
              type="date"
              name="from"
              aria-label="From date"
              defaultValue={from ?? ''}
              className="text-sm rounded-lg px-2 py-1.5 min-w-0 w-[132px]"
              style={{ border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--card)' }}
            />
            <span className="text-xs shrink-0" style={{ color: 'var(--ink-3)' }}>to</span>
            <input
              type="date"
              name="to"
              aria-label="To date"
              defaultValue={to ?? ''}
              className="text-sm rounded-lg px-2 py-1.5 min-w-0 w-[132px]"
              style={{ border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--card)' }}
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
                href="/calls"
                className="text-sm font-semibold px-2.5 sm:px-3.5 py-1.5 rounded-lg shrink-0"
                style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
              >
                Clear
              </Link>
            )}
          </form>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-3 sm:px-6 pb-3 sm:pb-6 max-w-[1220px] w-full mx-auto">
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
          <CallsExplorer calls={calls} timeZone={timeZone} />
        )}
      </div>
    </div>
  )
}
