'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resumeCallingAction } from '../actions'

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
  const [showConfirm, setShowConfirm] = useState(false)

  function resume(overrideWindow: boolean) {
    setMessage('')
    startTransition(async () => {
      try {
        await resumeCallingAction(campaignId, overrideWindow)
        setShowConfirm(false)
        router.refresh()
      } catch (err) {
        setShowConfirm(false)
        setMessage(err instanceof Error ? err.message : 'Failed to resume.')
      }
    })
  }

  function handleResumeClick() {
    if (withinWindow) resume(false)
    else setShowConfirm(true)
  }

  if (status !== 'active') return null

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
        <button onClick={handleResumeClick} disabled={isPending}
          className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: 'var(--violet)' }}>
          {isPending ? 'Resuming…' : `Resume (${queuedCount} queued)`}
        </button>
        {message && <p className="text-xs" style={{ color: 'var(--coral)' }}>{message}</p>}

        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="rounded-2xl p-5 max-w-md w-full flex flex-col gap-3" style={{ background: 'var(--card)' }}>
              <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Resume outside calling hours?</h3>
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                It&apos;s currently outside the usual 9am–8pm calling window. The next call will go out right away if you confirm — proceed anyway?
              </p>
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setShowConfirm(false)} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                  Cancel
                </button>
                <button onClick={() => resume(true)} disabled={isPending}
                  className="rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: 'var(--violet)' }}>
                  {isPending ? 'Resuming…' : 'Resume anyway'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
