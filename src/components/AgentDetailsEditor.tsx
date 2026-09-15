'use client'

import { useEffect, useState, useTransition } from 'react'
import { saveAgentDetails, type SectionEdit } from '@/app/(dashboard)/agent-details/actions'
import type { StructuredDraft } from '@/lib/briefing'
import type { PromptSection } from '@/lib/promptSections'
import { useNavigationBlocker } from '@/lib/navigationBlocker'
import TextSectionField from './sections/TextSectionField'
import HoursSectionField from './sections/HoursSectionField'
import ServicesSectionField from './sections/ServicesSectionField'
import StaffSectionField from './sections/StaffSectionField'

type Props = {
  businessId: string
  businessName: string
  initialStructured: StructuredDraft
  isPendingReview: boolean
  sections: PromptSection[]
}

export default function AgentDetailsEditor({ businessId, businessName, initialStructured, isPendingReview, sections }: Props) {
  const [structured, setStructured] = useState(initialStructured)
  const [textContent, setTextContent] = useState<Record<string, string>>(
    Object.fromEntries(sections.filter(s => s.kind === 'text').map(s => [s.id, s.draftContent ?? s.content ?? '']))
  )
  const [isPending, startTransition] = useTransition()

  const currentSnapshot = JSON.stringify({ structured, textContent })
  const initialSnapshot = JSON.stringify({ structured: initialStructured, textContent: Object.fromEntries(sections.filter(s => s.kind === 'text').map(s => [s.id, s.draftContent ?? s.content ?? ''])) })
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(initialSnapshot)
  const isDirty = currentSnapshot !== initialSnapshot
  const isClean = currentSnapshot === lastSavedSnapshot

  const { setIsBlocked } = useNavigationBlocker()
  useEffect(() => {
    setIsBlocked(isDirty)
  }, [isDirty, setIsBlocked])
  useEffect(() => () => setIsBlocked(false), [setIsBlocked])

  function handleSave() {
    const sectionEdits: SectionEdit[] = sections
      .filter(s => s.kind === 'text' && textContent[s.id] !== (s.draftContent ?? s.content ?? ''))
      .map(s => ({ id: s.id, content: textContent[s.id] }))

    startTransition(async () => {
      await saveAgentDetails(businessId, { structured, sectionEdits })
      setLastSavedSnapshot(currentSnapshot)
    })
  }

  /** Reverts every field back to what loaded on this page view — discards
   *  local edits only, nothing server-side to undo since Save is the only
   *  thing that ever writes. */
  function handleCancel() {
    setStructured(initialStructured)
    setTextContent(Object.fromEntries(sections.filter(s => s.kind === 'text').map(s => [s.id, s.draftContent ?? s.content ?? ''])))
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
          Agent Details
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
          This is what Ellie actually says on calls for {businessName}. Changes here are reviewed by our team before going live.
        </p>
      </div>

      {isPendingReview && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(217,138,11,0.08)', border: '1px solid rgba(217,138,11,0.25)', color: 'var(--amber)' }}>
          You have changes pending review — they haven&apos;t gone live yet.
        </div>
      )}

      {/* CSS columns, not grid — a two-column grid sizes every row to its
         tallest card, so a short card leaves dead space above the next row.
         Columns pack each card directly under the previous one instead. */}
      <div className="columns-1 md:columns-2 gap-4">
        {sections.map(s => {
          if (s.kind === 'text') {
            return (
              <div key={s.id} className="mb-4 break-inside-avoid-column">
                <TextSectionField title={s.title} value={textContent[s.id] ?? ''}
                  onChange={next => setTextContent(prev => ({ ...prev, [s.id]: next }))} />
              </div>
            )
          }
          if (s.kind === 'hours_table') {
            return (
              <div key={s.id} className="mb-4 break-inside-avoid-column">
                <HoursSectionField title={s.title} hours={structured.hours} onChange={next => setStructured(prev => ({ ...prev, hours: next }))} />
              </div>
            )
          }
          if (s.kind === 'services_table') {
            return (
              <div key={s.id} className="mb-4 break-inside-avoid-column">
                <ServicesSectionField title={s.title} services={structured.services} onChange={next => setStructured(prev => ({ ...prev, services: next }))} />
              </div>
            )
          }
          return (
            <div key={s.id} className="mb-4 break-inside-avoid-column">
              <StaffSectionField title={s.title} staff={structured.staff} businessHours={structured.hours} onChange={next => setStructured(prev => ({ ...prev, staff: next }))} />
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 sticky bottom-3 z-20 py-3 px-4 rounded-2xl"
        style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        <button onClick={handleSave} disabled={isPending}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}>
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        <button onClick={handleCancel} disabled={isPending || !isDirty}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-0"
          style={{ color: 'var(--t3)', border: '1px solid var(--border)' }}>
          Cancel
        </button>
        {isClean && !isPending && <span className="text-xs" style={{ color: 'var(--signal)' }}>Saved — pending review.</span>}
        {!isClean && !isPending && <span className="text-xs" style={{ color: 'var(--t5)' }}>Unsaved changes</span>}
      </div>
    </div>
  )
}
