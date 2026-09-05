'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmConsentAction, callNextBatchAction } from '../actions'

type Props = {
  campaignId: string
  status: string
  pendingCount: number
}

export default function CampaignDetailActions({ campaignId, status, pendingCount }: Props) {
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

  function callBatch() {
    setMessage('')
    startTransition(async () => {
      try {
        const result = await callNextBatchAction(campaignId)
        setMessage(`Placed ${result.placed} call${result.placed === 1 ? '' : 's'}${result.failed ? `, ${result.failed} failed` : ''}.`)
        router.refresh()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to place calls.')
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

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <button onClick={callBatch} disabled={isPending || pendingCount === 0}
        className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
        style={{ background: 'var(--violet)' }}>
        {isPending ? 'Calling…' : pendingCount === 0 ? 'All contacts called' : `Call next batch (${Math.min(5, pendingCount)} of ${pendingCount} pending)`}
      </button>
      {message && <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{message}</p>}
    </div>
  )
}
