import { getCurrentBusiness } from '@/lib/business'
import { getLocalCalls, callSummary, type LocalCall } from '@/lib/calls'
import { formatInZone, dateStrInZone, addDaysInZone } from '@/lib/timezone'
import { Mic, Download } from 'lucide-react'
import RecordingsExplorer, { type RecordingItem } from '@/components/RecordingsExplorer'

const RANGE_DAYS: Record<string, number | null> = { '7': 7, '30': 30, '90': 90, all: null }

export default async function RecordingsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const { range: rawRange } = await searchParams
  const range = rawRange && rawRange in RANGE_DAYS ? rawRange : '30'

  const { business: biz } = await getCurrentBusiness()
  const timeZone = biz?.timezone ?? 'Australia/Adelaide'

  let calls: LocalCall[] = []
  let fetchError: string | null = null

  if (!biz) {
    fetchError = 'No business profile found.'
  } else {
    try {
      const days = RANGE_DAYS[range]
      calls = await getLocalCalls(biz.id, {
        limit: 300,
        dateRange: days != null
          ? { from: dateStrInZone(addDaysInZone(new Date(), -days, timeZone), timeZone), timeZone }
          : undefined,
      })
    } catch (err) {
      console.error('Failed to fetch local calls:', err)
      fetchError = 'Could not load recordings — please try again shortly.'
    }
  }

  const recordings: RecordingItem[] = calls
    .filter(c => !!c.recording_url)
    .map(call => {
      const when = call.started_at ? new Date(call.started_at) : null
      return {
        id: call.id,
        displayName: call.caller_name?.trim() || call.caller_phone || 'Unknown caller',
        customerNumber: call.caller_phone ?? undefined,
        summary: callSummary(call).text,
        recordingUrl: call.recording_url!,
        hasTranscript: !!call.transcript,
        startedTime: when ? formatInZone(when, timeZone, { hour: 'numeric', minute: '2-digit' }) : undefined,
        startedDate: when ? formatInZone(when, timeZone, { day: 'numeric', month: 'short' }) : undefined,
        durationSecs: call.duration_seconds ?? 0,
      }
    })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
              Recordings
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Listen back to any call, with the full transcript alongside
            </p>
          </div>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-not-allowed opacity-50"
            style={{ border: '1px solid var(--line)', color: 'var(--ink-2)', background: 'var(--card)' }}
          >
            <Download size={14} /> Download all
          </button>
        </div>

        {fetchError ? (
          <div
            className="rounded-2xl py-14 text-center px-6 flex flex-col items-center gap-2"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--coral-soft)' }}>
              <Mic size={16} style={{ color: 'var(--coral)' }} />
            </div>
            <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>Setup required</p>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{fetchError}</p>
          </div>
        ) : (
          <RecordingsExplorer recordings={recordings} range={range} />
        )}
      </div>
    </div>
  )
}
