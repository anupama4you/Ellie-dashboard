import Link from 'next/link'
import { getCurrentBusiness } from '@/lib/business'
import { getCalls, getCustomer, getAssistantPhoneNumber, callDuration, VapiError } from '@/lib/vapi'
import { PhoneOff, Search } from 'lucide-react'
import CallsExplorer, { type CallItem } from '@/components/CallsExplorer'

function fmtTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
  }
}

const ERROR_REASONS = new Set([
  'exceeded-max-duration',
  'max-duration-exceeded',
  'silence-timed-out',
  'error-assistant-did-not-receive-customer-audio',
  'assistant-did-not-receive-customer-audio',
  'error-assistant-not-invalid-tool-call-payload',
  'twilio-failed-to-connect-call',
  'twilio-reported-customer-misdialed',
  'sip-telephony-provider-closed-call',
  'vonage-rejected',
  'assistant-error',
  'pipeline-error',
  'custom-function-error',
  'worker-shutdown',
  'unknown-error',
])

function classify(endedReason?: string): { category: CallItem['category']; label: string; color: string; bg: string } {
  if (endedReason === 'appointment-scheduled') {
    return { category: 'booked', label: 'Booked', color: 'var(--signal)', bg: 'var(--signal-soft)' }
  }
  if (endedReason === 'call-transferred') {
    return { category: 'transferred', label: 'Transferred', color: 'var(--amber)', bg: 'var(--amber-soft)' }
  }
  if (endedReason === 'customer-did-not-answer') {
    return { category: 'missed', label: 'No answer', color: 'var(--coral)', bg: 'var(--coral-soft)' }
  }
  if (endedReason === 'voicemail') {
    return { category: 'missed', label: 'Voicemail', color: 'var(--coral)', bg: 'var(--coral-soft)' }
  }
  if (endedReason === 'customer-busy') {
    return { category: 'missed', label: 'Busy', color: 'var(--coral)', bg: 'var(--coral-soft)' }
  }
  if (endedReason && (ERROR_REASONS.has(endedReason) || endedReason.toLowerCase().includes('error'))) {
    return { category: 'errored', label: 'Error', color: 'var(--coral)', bg: 'var(--coral-soft)' }
  }
  return { category: 'enquiry', label: 'Enquiry', color: 'var(--violet)', bg: 'var(--violet-soft)' }
}

function typeLabel(type?: string) {
  if (type === 'webCall') return 'Web'
  if (type === 'outboundPhoneCall') return 'Outbound'
  if (type === 'inboundPhoneCall') return 'Inbound'
  return 'Phone'
}

const BATCH_SIZE = 300
const DATE_RANGE_LIMIT = 500

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from, to } = await searchParams
  const hasDateFilter = Boolean(from || to)

  const { business: biz } = await getCurrentBusiness()

  let rawCalls: Awaited<ReturnType<typeof getCalls>> = []
  let fetchError: string | null = null

  if (!biz) {
    fetchError = 'No business profile found.'
  } else if (!biz.vapi_assistant_id) {
    fetchError = 'No Vapi Assistant ID set on your business profile.'
  } else {
    try {
      rawCalls = hasDateFilter
        ? await getCalls(biz.vapi_assistant_id, DATE_RANGE_LIMIT, 1, { from, to })
        : await getCalls(biz.vapi_assistant_id, BATCH_SIZE)
    } catch (err) {
      console.error('Failed to fetch calls from Vapi:', err)
      fetchError = err instanceof VapiError && err.status === 400 && err.detail
        ? err.detail
        : 'Could not reach Vapi — check your assistant ID and VAPI_PRIVATE_KEY.'
    }
  }

  const calls: CallItem[] = rawCalls.map(call => {
    const { category, label, color, bg } = classify(call.endedReason)
    const dt = call.startedAt ? fmtTime(call.startedAt) : null
    const customer = getCustomer(call)
    // Web calls have no phone number on either end; real phone calls answer on the business's Ellie number.
    const assistantNumber = getAssistantPhoneNumber(call) || (call.type !== 'webCall' ? biz?.phone ?? undefined : undefined)
    return {
      id: call.id,
      type: call.type,
      typeLabel: typeLabel(call.type),
      assistantNumber,
      customerNumber: customer.number,
      customerName: customer.name,
      startedAtIso: call.startedAt,
      startedDate: dt?.date,
      startedTime: dt?.time,
      durationSecs: callDuration(call),
      summary: call.analysis?.summary,
      category,
      badgeLabel: label,
      badgeColor: color,
      badgeBg: bg,
      recordingUrl: call.artifact?.recordingUrl,
      hasTranscript: !!call.artifact?.transcript,
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
