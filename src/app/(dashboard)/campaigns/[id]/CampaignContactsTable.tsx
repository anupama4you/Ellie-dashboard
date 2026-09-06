'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { categoryStyle } from '@/lib/callClassify'
import { startCallingAction } from '../actions'

type Contact = {
  id: string
  name: string
  phone: string
  note: string | null
  status: string
  outcome: string | null
}

type Props = {
  campaignId: string
  contacts: Contact[]
  running: boolean
  withinWindow: boolean
  firstMessage: string
  systemPrompt: string
}

const SELECTABLE_STATUSES = new Set(['pending', 'failed'])

function pillFor(c: Contact) {
  if (c.status === 'done') return categoryStyle(c.outcome ?? 'done')
  if (c.status === 'calling') return { label: 'Calling', color: 'var(--violet)', bg: 'var(--violet-soft)' }
  if (c.status === 'queued') return { label: 'Queued', color: 'var(--ink-3)', bg: 'var(--paper)' }
  if (c.status === 'failed') return { label: 'Failed', color: 'var(--coral)', bg: 'var(--coral-soft)' }
  return { label: 'Pending', color: 'var(--ink-3)', bg: 'var(--paper)' }
}

/** The contacts table plus the "select rows → start calling" flow. Owns
 * selection state and the pre-start confirmation modal as a client
 * component since checkboxes need interactivity a Server Component can't
 * provide; still calls back into the same startCallingAction Server Action
 * everything else here uses. */
export default function CampaignContactsTable({ campaignId, contacts, running, withinWindow, firstMessage, systemPrompt }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')

  const selectable = useMemo(() => contacts.filter(c => SELECTABLE_STATUSES.has(c.status)), [contacts])
  const allSelected = selectable.length > 0 && selectable.every(c => selected.has(c.id))

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map(c => c.id)))
  }

  function confirmStart() {
    setError('')
    startTransition(async () => {
      try {
        await startCallingAction(campaignId, [...selected], !withinWindow)
        setSelected(new Set())
        setShowConfirm(false)
        router.refresh()
      } catch (err) {
        setShowConfirm(false)
        setError(err instanceof Error ? err.message : 'Failed to start calling.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && !running && (
        <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ background: 'var(--violet-soft)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--violet)' }}>{selected.size} selected</p>
          <button onClick={() => setShowConfirm(true)} disabled={isPending}
            className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: 'var(--violet)' }}>
            Start calling
          </button>
        </div>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--coral)' }}>{error}</p>}

      <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Contacts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th className="px-5 py-2.5 w-8">
                  {selectable.length > 0 && !running && (
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all callable contacts" />
                  )}
                </th>
                <th className="text-left font-semibold px-5 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Name</th>
                <th className="text-left font-semibold px-5 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Phone</th>
                <th className="text-left font-semibold px-5 py-2.5" style={{ color: 'var(--ink-3)' }}>Note</th>
                <th className="text-left font-semibold px-5 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => {
                const pill = pillFor(c)
                const canSelect = SELECTABLE_STATUSES.has(c.status) && !running
                return (
                  <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                    <td className="px-5 py-3">
                      {canSelect && (
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} />
                      )}
                    </td>
                    <td className="px-5 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--ink)' }}>{c.name}</td>
                    <td className="px-5 py-3 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>{c.phone}</td>
                    <td className="px-5 py-3" style={{ color: 'var(--ink-3)' }}>{c.note ?? '—'}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full" style={{ color: pill.color, background: pill.bg }}>
                        {c.status === 'calling' && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: pill.color }} />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: pill.color }} />
                          </span>
                        )}
                        {pill.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="rounded-2xl p-5 max-w-md w-full flex flex-col gap-3" style={{ background: 'var(--card)' }}>
            <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
              Start calling {selected.size} contact{selected.size === 1 ? '' : 's'}?
            </h3>
            <div className="text-xs flex flex-col gap-2" style={{ color: 'var(--ink-3)' }}>
              <p><strong style={{ color: 'var(--ink)' }}>Opening line:</strong> {firstMessage}</p>
              <p><strong style={{ color: 'var(--ink)' }}>Behavior:</strong> {systemPrompt}</p>
              <p>
                Ellie will call these one at a time in the background — you don&apos;t need to keep this page open.
                If the run reaches the end of the 9am–8pm window it pauses until you resume it manually. If a call
                can&apos;t be placed because of a system issue, the run stops there and we&apos;ll email you.
              </p>
              {!withinWindow && (
                <p className="rounded-lg px-3 py-2" style={{ color: 'var(--amber)', background: 'var(--amber-soft)' }}>
                  It&apos;s currently outside the usual 9am–8pm calling window. The first call will go out right away
                  if you confirm — proceed anyway?
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setShowConfirm(false)} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                Cancel
              </button>
              <button onClick={confirmStart} disabled={isPending}
                className="rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: 'var(--violet)' }}>
                {isPending ? 'Starting…' : 'Confirm & start'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
