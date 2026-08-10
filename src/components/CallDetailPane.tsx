'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, PhoneIncoming } from 'lucide-react'
import CallDetailPanel, { type CallDetailData } from './CallDetailPanel'
import CallDetailSkeleton from './CallDetailSkeleton'
import { recordingProxyUrl } from '@/lib/recordingUrl'
import type { CallItem } from './CallsExplorer'

// Shape returned by GET /api/client/calls/[callId] — the raw `calls` row.
type RawCall = {
  call_type: string | null
  caller_phone: string | null
  caller_name: string | null
  started_at: string | null
  duration_seconds: number | null
  status: string | null
  ended_reason: string | null
  success_evaluation: string | null
  summary: string | null
  recording_url: string | null
  transcript: string | null
  vapi_call_id: string
}

function toDetailData(raw: RawCall): CallDetailData {
  return {
    type: raw.call_type ?? undefined,
    customerNumber: raw.caller_phone ?? undefined,
    customerName: raw.caller_name ?? undefined,
    startedAtIso: raw.started_at ?? undefined,
    durationSecs: raw.duration_seconds ?? 0,
    status: raw.status ?? undefined,
    endedReason: raw.ended_reason ?? undefined,
    successEvaluation: raw.success_evaluation ?? undefined,
    summary: raw.summary ?? undefined,
    recordingUrl: raw.recording_url ? recordingProxyUrl(raw.vapi_call_id) : undefined,
    transcript: raw.transcript ?? undefined,
    vapiCallId: raw.vapi_call_id ?? undefined,
  }
}

export default function CallDetailPane({
  selected,
  timeZone,
  onClose,
}: {
  selected: CallItem | null
  timeZone: string
  onClose: () => void
}) {
  // Per-session cache so re-selecting a call already viewed doesn't refetch.
  // Only ever read/written from inside the effect below, never during render.
  const cache = useRef<Map<string, CallDetailData>>(new Map())

  // Tagged with the id it's for, so a still-in-flight fetch for a call the
  // user has since navigated away from can't clobber the current selection —
  // and so a fresh selection reads as "loading" until its own result lands.
  const [result, setResult] = useState<{ id: string; data: CallDetailData } | { id: string; error: true } | null>(null)

  useEffect(() => {
    if (!selected) return
    const id = selected.id
    let cancelled = false

    const cached = cache.current.get(id)
    const dataPromise = cached
      ? Promise.resolve(cached)
      : fetch(`/api/client/calls/${id}`)
          .then(res => {
            if (!res.ok) throw new Error(`Request failed: ${res.status}`)
            return res.json() as Promise<RawCall>
          })
          .then(toDetailData)

    dataPromise
      .then(data => {
        if (cancelled) return
        cache.current.set(id, data)
        setResult({ id, data })
      })
      .catch(() => {
        if (!cancelled) setResult({ id, error: true })
      })

    return () => { cancelled = true }
  }, [selected])

  const outcome   = selected && result?.id === selected.id ? result : null
  const detail    = outcome && 'data' in outcome ? outcome.data : null
  const hasError  = !!outcome && 'error' in outcome
  const isLoading = !!selected && !outcome

  if (!selected) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--card)' }}>
          <PhoneIncoming size={20} style={{ color: 'var(--ink-3)' }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Select a call to view details</p>
        <p className="text-xs max-w-[240px]" style={{ color: 'var(--ink-3)' }}>
          Its summary, transcript and recording load once you pick one.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="p-5 flex flex-col gap-4">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm w-fit transition-opacity hover:opacity-70 lg:hidden"
          style={{ color: 'var(--ink-3)' }}
        >
          <ArrowLeft size={14} /> Back to calls
        </button>

        {isLoading ? (
          <CallDetailSkeleton />
        ) : hasError ? (
          <div className="rounded-xl p-6 text-center" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
            <p className="text-sm" style={{ color: 'var(--coral)' }}>Couldn&apos;t load this call — please try again.</p>
          </div>
        ) : detail ? (
          <CallDetailPanel call={detail} timeZone={timeZone} />
        ) : null}
      </div>
    </div>
  )
}
