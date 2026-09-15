'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { updateCampaignAction } from '../actions'

type Props = {
  campaignId: string
  name: string
  firstMessage: string
  systemPrompt: string
  /** Editing is blocked while a run is in progress — first_message/system_prompt
   *  are read fresh from this row for every call in the chain, so changing
   *  them mid-run would give some contacts a different script than others. */
  canEdit: boolean
}

/** Read-only by default; toggles into an edit form (name + opening line +
 *  behavior together, one Save) when the client clicks Edit. Reverts to
 *  read-only on cancel or a successful save. */
export default function CampaignDetailsCard({ campaignId, name, firstMessage, systemPrompt, canEdit }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [draftName, setDraftName] = useState(name)
  const [draftFirstMessage, setDraftFirstMessage] = useState(firstMessage)
  const [draftSystemPrompt, setDraftSystemPrompt] = useState(systemPrompt)

  function startEditing() {
    setDraftName(name)
    setDraftFirstMessage(firstMessage)
    setDraftSystemPrompt(systemPrompt)
    setError('')
    setEditing(true)
  }

  function save() {
    setError('')
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set('name', draftName)
        formData.set('firstMessage', draftFirstMessage)
        formData.set('systemPrompt', draftSystemPrompt)
        await updateCampaignAction(campaignId, formData)
        setEditing(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save changes.')
      }
    })
  }

  if (!editing) {
    return (
      <section className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Opening line</p>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>{firstMessage}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-3)' }}>How Ellie will behave on these calls</p>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>{systemPrompt}</p>
            </div>
          </div>
          {canEdit && (
            <button onClick={startEditing} aria-label="Edit campaign details"
              className="flex items-center gap-1.5 text-xs font-semibold shrink-0 transition-opacity hover:opacity-80"
              style={{ color: 'var(--violet)' }}>
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Campaign name</label>
        <input value={draftName} onChange={e => setDraftName(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Opening line</label>
        <textarea rows={2} value={draftFirstMessage} onChange={e => setDraftFirstMessage(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm resize-y" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>How should Ellie behave on these calls?</label>
        <textarea rows={4} value={draftSystemPrompt} onChange={e => setDraftSystemPrompt(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm resize-y" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--coral)' }}>{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setEditing(false)} disabled={isPending}
          className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
          Cancel
        </button>
        <button onClick={save} disabled={isPending}
          className="rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: 'var(--violet)' }}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}
