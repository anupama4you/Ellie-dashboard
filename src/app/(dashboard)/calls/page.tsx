import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCalls, callDuration, VapiError } from '@/lib/vapi'
import { ChevronLeft, ChevronRight, PhoneOff, Phone, PhoneIncoming, MicOff, Clock } from 'lucide-react'
import CallRow from '@/components/CallRow'
import CallsFilter from '@/components/CallsFilter'

function fmtTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
  }
}

function Divider() {
  return <div className="w-px h-4 mx-1.5" style={{ background: 'var(--b3)' }} />
}

function StatPill({
  icon, iconBg, value, label, color,
}: {
  icon: React.ReactNode
  iconBg: string
  value: string | number
  label: string
  color: string
}) {
  return (
    <div className="flex items-center gap-2 px-1.5 py-0.5">
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>{value}</span>
        <span className="text-xs" style={{ color: 'var(--t4)' }}>{label}</span>
      </div>
    </div>
  )
}

const ERROR_BG    = 'rgba(248,113,113,0.1)'
const ERROR_COLOR = '#f87171'
const WARN_BG     = 'rgba(251,146,60,0.1)'
const WARN_COLOR  = '#fb923c'
const MUTED_BG    = 'rgba(148,163,184,0.1)'
const MUTED_COLOR = '#94a3b8'

const ENDED_REASON: Record<string, { label: string; color: string; bg: string }> = {
  'customer-ended-call':                              { label: 'Ended by caller',    color: '#34d399',   bg: 'rgba(52,211,153,0.1)'  },
  'assistant-ended-call':                             { label: 'Ended',              color: '#a78bfa',   bg: 'rgba(167,139,250,0.1)' },
  'appointment-scheduled':                            { label: 'Booked',             color: '#34d399',   bg: 'rgba(52,211,153,0.1)'  },
  'call-transferred':                                 { label: 'Transferred',        color: '#60a5fa',   bg: 'rgba(96,165,250,0.1)'  },
  'customer-did-not-answer':                          { label: 'No answer',          color: ERROR_COLOR, bg: ERROR_BG   },
  'customer-busy':                                    { label: 'Busy',               color: WARN_COLOR,  bg: WARN_BG    },
  'voicemail':                                        { label: 'Voicemail',          color: WARN_COLOR,  bg: WARN_BG    },
  'exceeded-max-duration':                            { label: 'Max duration',       color: WARN_COLOR,  bg: WARN_BG    },
  'max-duration-exceeded':                            { label: 'Max duration',       color: WARN_COLOR,  bg: WARN_BG    },
  'silence-timed-out':                                { label: 'Silence timeout',    color: WARN_COLOR,  bg: WARN_BG    },
  'error-assistant-did-not-receive-customer-audio':   { label: 'No audio received',  color: ERROR_COLOR, bg: ERROR_BG   },
  'assistant-did-not-receive-customer-audio':         { label: 'No audio received',  color: ERROR_COLOR, bg: ERROR_BG   },
  'error-assistant-not-invalid-tool-call-payload':    { label: 'Tool error',         color: ERROR_COLOR, bg: ERROR_BG   },
  'twilio-failed-to-connect-call':                    { label: 'Failed to connect',  color: ERROR_COLOR, bg: ERROR_BG   },
  'twilio-reported-customer-misdialed':               { label: 'Misdialled',         color: WARN_COLOR,  bg: WARN_BG    },
  'sip-telephony-provider-closed-call':               { label: 'Provider closed',    color: MUTED_COLOR, bg: MUTED_BG   },
  'vonage-rejected':                                  { label: 'Rejected',           color: ERROR_COLOR, bg: ERROR_BG   },
  'assistant-error':                                  { label: 'Assistant error',    color: ERROR_COLOR, bg: ERROR_BG   },
  'pipeline-error':                                   { label: 'Pipeline error',     color: ERROR_COLOR, bg: ERROR_BG   },
  'custom-function-error':                            { label: 'Tool error',         color: ERROR_COLOR, bg: ERROR_BG   },
  'worker-shutdown':                                  { label: 'Server restart',     color: MUTED_COLOR, bg: MUTED_BG   },
  'unknown-error':                                    { label: 'Unknown error',      color: ERROR_COLOR, bg: ERROR_BG   },
}

function endedReasonBadge(reason?: string) {
  if (!reason) return { label: 'Completed', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' }
  if (ENDED_REASON[reason]) return ENDED_REASON[reason]
  const normalised = reason.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '-').replace(/-+/g, '-')
  if (ENDED_REASON[normalised]) return ENDED_REASON[normalised]
  const low = reason.toLowerCase()
  if (low.includes('audio'))    return { label: 'No audio',    color: ERROR_COLOR, bg: ERROR_BG }
  if (low.includes('error'))    return { label: 'Error',       color: ERROR_COLOR, bg: ERROR_BG }
  if (low.includes('timeout') || low.includes('timed')) return { label: 'Timeout', color: WARN_COLOR, bg: WARN_BG }
  if (low.includes('transfer')) return { label: 'Transferred', color: '#60a5fa',   bg: 'rgba(96,165,250,0.1)' }
  if (low.includes('voicemail'))return { label: 'Voicemail',   color: WARN_COLOR,  bg: WARN_BG }
  if (low.includes('busy'))     return { label: 'Busy',        color: WARN_COLOR,  bg: WARN_BG }
  return { label: 'Completed', color: MUTED_COLOR, bg: MUTED_BG }
}

function matchOutcome(endedReason: string | undefined, outcome: string): boolean {
  if (!outcome) return true
  if (outcome === 'missed')    return endedReason === 'customer-did-not-answer'
  if (outcome === 'voicemail') return endedReason === 'voicemail'
  if (outcome === 'booked')    return endedReason === 'appointment-scheduled'
  if (outcome === 'answered')  return (
    endedReason !== 'customer-did-not-answer' &&
    endedReason !== 'voicemail' &&
    endedReason !== 'customer-busy'
  )
  return true
}

const PAGE_SIZE      = 25
const DATE_RANGE_LIMIT = 500

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; from?: string; to?: string; outcome?: string }>
}) {
  const { page: pageStr, from, to, outcome } = await searchParams
  const hasDateFilter = Boolean(from || to)
  const page  = hasDateFilter ? 1 : Math.max(1, parseInt(pageStr ?? '1'))
  const limit = hasDateFilter ? DATE_RANGE_LIMIT : PAGE_SIZE

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: biz } = await supabase
    .from('businesses')
    .select('vapi_assistant_id')
    .eq('user_id', user?.id)
    .single()

  let rawCalls: Awaited<ReturnType<typeof getCalls>> = []
  let fetchError: string | null = null

  if (!biz) {
    fetchError = 'No business profile found.'
  } else if (!biz.vapi_assistant_id) {
    fetchError = 'No Vapi Assistant ID set on your business profile.'
  } else {
    try {
      rawCalls = await getCalls(
        biz.vapi_assistant_id,
        limit,
        page,
        from || to ? { from, to } : undefined,
      )
    } catch (err) {
      console.error('Failed to fetch calls from Vapi:', err)
      // Vapi 400s carry user-actionable messages (e.g. date range outside the plan's retention window)
      fetchError = err instanceof VapiError && err.status === 400 && err.detail
        ? err.detail
        : 'Could not reach Vapi — check your assistant ID and VAPI_PRIVATE_KEY.'
    }
  }

  const calls = outcome
    ? rawCalls.filter(c => matchOutcome(c.endedReason, outcome))
    : rawCalls

  const hasPrev = !hasDateFilter && page > 1
  const hasNext = !hasDateFilter && rawCalls.length === PAGE_SIZE

  function pageLink(p: number) {
    const q = new URLSearchParams()
    if (from)    q.set('from', from)
    if (to)      q.set('to', to)
    if (outcome) q.set('outcome', outcome)
    q.set('page', String(p))
    return `/calls?${q}`
  }

  const answered = calls.filter(c =>
    c.endedReason !== 'customer-did-not-answer' &&
    c.endedReason !== 'voicemail' &&
    c.endedReason !== 'customer-busy'
  ).length
  const missed   = calls.filter(c => c.endedReason === 'customer-did-not-answer').length
  const recorded = calls.filter(c => c.artifact?.recordingUrl).length
  const totalDuration = calls.reduce((sum, c) => sum + callDuration(c), 0)
  const avgDurationSecs = calls.length ? Math.round(totalDuration / calls.length) : 0
  const avgDuration = avgDurationSecs > 0
    ? avgDurationSecs < 60
      ? `${avgDurationSecs}s`
      : `${Math.floor(avgDurationSecs / 60)}m ${avgDurationSecs % 60}s`
    : '—'

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 flex flex-col gap-5">

        {/* Filter bar */}
        <Suspense>
          <CallsFilter />
        </Suspense>

        {/* Summary strip */}
        {calls.length > 0 && !fetchError && (
          <div
            className="flex items-center gap-1 px-3 py-2.5 rounded-xl flex-wrap"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}
          >
            <StatPill
              icon={<div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--violet)' }} />}
              iconBg="rgba(167,139,250,0.1)"
              value={calls.length}
              label={hasDateFilter ? 'calls in range' : 'calls'}
              color="var(--text)"
            />
            <Divider />
            <StatPill
              icon={<Phone size={12} style={{ color: '#34d399' }} />}
              iconBg="rgba(52,211,153,0.1)"
              value={answered}
              label="answered"
              color="#34d399"
            />
            <Divider />
            <StatPill
              icon={<PhoneOff size={12} style={{ color: '#f87171' }} />}
              iconBg="rgba(248,113,113,0.1)"
              value={missed}
              label="missed"
              color="#f87171"
            />
            <Divider />
            <StatPill
              icon={<MicOff size={12} style={{ color: 'var(--t3)' }} />}
              iconBg="rgba(148,163,184,0.1)"
              value={recorded}
              label="recorded"
              color="var(--text)"
            />
            <Divider />
            <StatPill
              icon={<Clock size={12} style={{ color: '#fbbf24' }} />}
              iconBg="rgba(251,191,36,0.1)"
              value={avgDuration}
              label="avg. duration"
              color="var(--text)"
            />
          </div>
        )}

        {/* Table */}
        <div className="card">
          {/* Column headers */}
          <div
            className="grid px-5 py-3 text-xs font-semibold uppercase tracking-wider select-none"
            style={{
              color: 'var(--t4)',
              borderBottom: '1px solid var(--b3)',
              gridTemplateColumns: '32px 1fr 160px 80px 140px 40px',
            }}
          >
            <span />
            <span>Caller</span>
            <span>Started</span>
            <span>Duration</span>
            <span>Outcome</span>
            <span />
          </div>

          {/* Rows */}
          <div>
            {calls.map(call => {
              const badge   = endedReasonBadge(call.endedReason)
              const summary = call.analysis?.summary
              const dt      = call.startedAt ? fmtTime(call.startedAt) : null
              const dur     = callDuration(call)
              return (
                <CallRow
                  key={call.id}
                  id={call.id}
                  type={call.type}
                  customerNumber={call.customer?.number ?? call.customer?.name}
                  startedDate={dt?.date}
                  startedTime={dt?.time}
                  duration={dur}
                  badgeLabel={badge.label}
                  badgeColor={badge.color}
                  badgeBg={badge.bg}
                  summary={summary}
                  recordingUrl={call.artifact?.recordingUrl}
                  hasTranscript={!!call.artifact?.transcript}
                  paddingTop={summary ? '10px' : '14px'}
                  paddingBottom={summary ? '10px' : '14px'}
                />
              )
            })}
          </div>

          {fetchError && (
            <div className="py-12 text-center px-6 flex flex-col items-center gap-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}
              >
                <PhoneOff size={16} style={{ color: '#f87171' }} />
              </div>
              <p className="text-xs font-semibold" style={{ color: '#f87171' }}>Setup required</p>
              <p className="text-sm" style={{ color: 'var(--t4)' }}>{fetchError}</p>
            </div>
          )}

          {!fetchError && calls.length === 0 && (
            <div className="py-16 text-center flex flex-col items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(100,116,139,0.07)', border: '1px solid rgba(100,116,139,0.12)' }}
              >
                <PhoneIncoming size={20} style={{ color: 'var(--t4)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--t3)' }}>
                  {(from || to || outcome) ? 'No calls match your filters' : 'No calls yet — Ellie is ready and waiting'}
                </p>
                {(from || to || outcome) && (
                  <p className="text-xs mt-1" style={{ color: 'var(--t5)' }}>Try adjusting or clearing the filters</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pagination */}
        {(hasPrev || hasNext) && (
          <div className="flex items-center justify-between px-1">
            <Link
              href={pageLink(page - 1)}
              className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors font-medium ${hasPrev ? 'btn-ghost' : 'pointer-events-none opacity-25'}`}
              style={{ color: 'var(--t3)', border: '1px solid var(--b3)' }}
            >
              <ChevronLeft size={14} /> Previous
            </Link>
            <span
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ color: 'var(--t4)', background: 'var(--bg3)', border: '1px solid var(--border)' }}
            >
              Page {page}
            </span>
            <Link
              href={pageLink(page + 1)}
              className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors font-medium ${hasNext ? 'btn-ghost' : 'pointer-events-none opacity-25'}`}
              style={{ color: 'var(--t3)', border: '1px solid var(--b3)' }}
            >
              Next <ChevronRight size={14} />
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
