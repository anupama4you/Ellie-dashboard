'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmConsentAction, resumeCallingAction } from '../actions'

type Props = {
  campaignId: string
  status: string
  running: boolean
  stoppedReason: string | null
  queuedCount: number
  withinWindow: boolean
}

export default function CampaignDetailActions({ campaignId, status, running, stoppedReason, queuedCount, withinWindow }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [consented, setConsented] = useState(false)

  function confirmConsent() {
    setMessage('')
    startTransition(async () => {
      try {
        await confirmConsentAction(campaignId)
        router.refresh()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to confirm.')
      }
    })
  }

  function resume() {
    setMessage('')
    startTransition(async () => {
      try {
        await resumeCallingAction(campaignId)
        router.refresh()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to resume.')
      }
    })
  }

  if (status === 'draft') {
    return (
      <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)} className="mt-0.5" />
          These are my own existing customers and I have the right to contact them.
        </label>
        <button onClick={confirmConsent} disabled={!consented || isPending}
          className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: 'var(--violet)' }}>
          {isPending ? 'Confirming…' : 'Confirm & activate'}
        </button>
        {message && <p className="text-xs" style={{ color: 'var(--coral)' }}>{message}</p>}
      </div>
    )
  }

  if (running) {
    return (
      <div className="rounded-2xl p-5 flex items-center gap-2.5" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--violet)' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--violet)' }} />
        </span>
        <p className="text-sm font-semibold" style={{ color: 'var(--violet)' }}>Calling one contact at a time in the background — you can leave this page.</p>
      </div>
    )
  }

  if (stoppedReason && queuedCount > 0) {
    return (
      <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--amber-soft)', border: '1px solid var(--line)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--amber)' }}>Paused: {stoppedReason}</p>
        <button onClick={resume} disabled={isPending || !withinWindow}
          className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: 'var(--violet)' }}>
          {isPending ? 'Resuming…' : !withinWindow ? 'Outside calling hours' : `Resume (${queuedCount} queued)`}
        </button>
        {message && <p className="text-xs" style={{ color: 'var(--coral)' }}>{message}</p>}
      </div>
    )
  }

  return null
}
