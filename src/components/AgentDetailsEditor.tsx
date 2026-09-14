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
  const [saved, setSaved] = useState(false)

  const currentSnapshot = JSON.stringify({ structured, textContent })
  const initialSnapshot = JSON.stringify({ structured: initialStructured, textContent: Object.fromEntries(sections.filter(s => s.kind === 'text').map(s => [s.id, s.draftContent ?? s.content ?? ''])) })
  const isDirty = currentSnapshot !== initialSnapshot

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
      setSaved(true)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Agent Details</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--t5)' }}>
          This is what Ellie actually says on calls for {businessName}. Changes here are reviewed by our team before going live.
        </p>
      </div>

      {isPendingReview && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(217,138,11,0.08)', border: '1px solid rgba(217,138,11,0.25)', color: 'var(--amber)' }}>
          You have changes pending review — they haven&apos;t gone live yet.
        </div>
      )}

      {sections.map(s => {
        if (s.kind === 'text') {
          return (
            <TextSectionField key={s.id} title={s.title} value={textContent[s.id] ?? ''}
              onChange={next => setTextContent(prev => ({ ...prev, [s.id]: next }))} />
          )
        }
        if (s.kind === 'hours_table') {
          return <HoursSectionField key={s.id} title={s.title} hours={structured.hours} onChange={next => setStructured(prev => ({ ...prev, hours: next }))} />
        }
        if (s.kind === 'services_table') {
          return <ServicesSectionField key={s.id} title={s.title} services={structured.services} onChange={next => setStructured(prev => ({ ...prev, services: next }))} />
        }
        return <StaffSectionField key={s.id} title={s.title} staff={structured.staff} businessHours={structured.hours} onChange={next => setStructured(prev => ({ ...prev, staff: next }))} />
      })}

      <div className="flex items-center gap-3 sticky bottom-0 py-3 px-1" style={{ background: 'var(--bg1)' }}>
        <button onClick={handleSave} disabled={isPending}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}>
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        {saved && !isPending && <span className="text-xs" style={{ color: 'var(--signal)' }}>Saved — pending review.</span>}
        {isDirty && !isPending && !saved && <span className="text-xs" style={{ color: 'var(--t5)' }}>Unsaved changes</span>}
      </div>
    </div>
  )
}
