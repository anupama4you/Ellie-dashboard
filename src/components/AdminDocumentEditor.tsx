'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Send, ChevronRight, PhoneCall } from 'lucide-react'
import type { PromptSection, SectionKind } from '@/lib/promptSections'
import type { StructuredDraft } from '@/lib/briefing'
import {
  addSection, removeSection, reorderSections, setSectionEditable, saveSectionDirect, applyPendingChanges,
} from '@/app/admin/clients/[id]/prompt/actions'
import HoursSectionField from './sections/HoursSectionField'
import ServicesSectionField from './sections/ServicesSectionField'
import StaffSectionField from './sections/StaffSectionField'

type Props = {
  businessId: string
  sections: PromptSection[]
  liveStructured: StructuredDraft
  draftStructured: StructuredDraft
  hasDraft: boolean
  expectedBriefingUpdatedAt: string | null
  liveVapiPrompt: string | null
  liveVapiError: string | null
}

const KIND_LABEL: Record<SectionKind, string> = {
  text: 'Text', hours_table: 'Hours (structured)', services_table: 'Services (structured)', staff_table: 'Team (structured)',
}

/**
 * Sorts object keys recursively before stringifying, so a live JS object
 * literal (fixed key order) and a value round-tripped through jsonb
 * (Postgres-canonicalized, possibly different key order) compare equal
 * when their actual content is identical. Without this, JSON.stringify
 * diffs on services/staff produce false positives on every draft.
 */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => [k, canon(val)]))
  }
  return v
}

function SectionDiff({ section }: { section: PromptSection }) {
  if (section.draftContent === null) return null
  return (
    <div className="px-5 py-3 text-xs" style={{ background: 'rgba(217,138,11,0.06)', borderTop: '1px solid rgba(217,138,11,0.2)' }}>
      <div style={{ color: 'var(--amber)' }} className="font-semibold mb-1">Client&apos;s pending edit:</div>
      <div className="whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{section.draftContent}</div>
    </div>
  )
}

/**
 * Read-only view of whatever is actually on the assistant on Vapi right
 * now — fetched fresh from Vapi's API on every page load, independent of
 * prompt_sections. Lets an admin see a prompt someone edited directly in
 * Vapi's own dashboard, which this app has no way to pull back into
 * sections automatically (it's just one opaque string to us).
 */
function LiveVapiPromptPanel({ prompt, error }: { prompt: string | null; error: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <PhoneCall size={13} style={{ color: 'var(--t4)' }} />
          <b className="text-sm" style={{ color: 'var(--text)' }}>Live on Vapi right now</b>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg2)', color: 'var(--t4)' }}>
            fetched directly from the assistant
          </span>
        </div>
        <ChevronRight size={14} style={{ color: 'var(--t3)', transform: open ? 'rotate(90deg)' : undefined }} />
      </button>
      {open && (
        <div className="px-5 pb-5">
          {error && (
            <p className="text-xs" style={{ color: 'var(--coral)' }}>Couldn&apos;t fetch the live assistant from Vapi: {error}</p>
          )}
          {!error && prompt === null && (
            <p className="text-xs" style={{ color: 'var(--t3)' }}>The assistant has no system message on Vapi.</p>
          )}
          {!error && prompt !== null && (
            <>
              <p className="text-xs mb-2" style={{ color: 'var(--t3)' }}>
                This is the assistant&apos;s actual system prompt on Vapi, independent of the sections below — if it was edited directly in Vapi&apos;s dashboard, that shows up here even before anyone applies changes from this app.
              </p>
              <pre className="whitespace-pre-wrap text-xs rounded-xl px-3.5 py-2.5 overflow-x-auto"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
                {prompt}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminDocumentEditor({ businessId, sections: initialSections, liveStructured, draftStructured, hasDraft, expectedBriefingUpdatedAt, liveVapiPrompt, liveVapiError }: Props) {
  const [sections, setSections] = useState(initialSections)
  const [drafts, setDrafts] = useState<Record<string, string>>(Object.fromEntries(initialSections.map(s => [s.id, s.content ?? ''])))
  const [isPending, startTransition] = useTransition()
  const [newTitle, setNewTitle] = useState('')

  const changedSections = sections.filter(s => s.draftContent !== null)
  const structuredChanged = hasDraft

  function move(id: string, dir: -1 | 1) {
    const idx = sections.findIndex(s => s.id === id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sections.length) return
    const next = [...sections]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    setSections(next)
    startTransition(() => reorderSections(businessId, next.map(s => s.id)))
  }

  function handleAdd() {
    if (!newTitle.trim()) return
    startTransition(async () => {
      const newSection = await addSection(businessId, { title: newTitle.trim(), headingLevel: 2, kind: 'text', clientEditable: false })
      setSections(prev => [...prev, newSection])
      setDrafts(prev => ({ ...prev, [newSection.id]: newSection.content ?? '' }))
      setNewTitle('')
    })
  }

  function handleSaveSection(id: string) {
    startTransition(() => saveSectionDirect(businessId, id, drafts[id] ?? ''))
  }

  function handleApply() {
    startTransition(() => applyPendingChanges(businessId, expectedBriefingUpdatedAt))
  }

  return (
    <div className="flex flex-col gap-4">
      <LiveVapiPromptPanel prompt={liveVapiPrompt} error={liveVapiError} />

      {(changedSections.length > 0 || structuredChanged) && (
        <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'rgba(217,138,11,0.06)', border: '1px solid rgba(217,138,11,0.25)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--amber)' }}>Pending client changes</h3>
          {changedSections.map(s => <SectionDiff key={s.id} section={s} />)}
          {structuredChanged && (
            <p className="text-xs" style={{ color: 'var(--text)' }}>
              Hours, services, team, greeting, and/or transfer number also have pending changes — review on the fields below before applying.
            </p>
          )}
          <button onClick={handleApply} disabled={isPending}
            className="self-start flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--signal)' }}>
            <Send size={13} /> Apply &amp; Push to Vapi
          </button>
        </div>
      )}

      {sections.map((s, i) => (
        <div key={s.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
            <div className="flex items-center gap-2">
              <b className="text-sm" style={{ color: 'var(--text)' }}>{'#'.repeat(s.headingLevel)} {s.title}</b>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg2)', color: 'var(--t4)' }}>{KIND_LABEL[s.kind]}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--t3)' }}>
                <input type="checkbox" checked={s.clientEditable}
                  onChange={e => { setSections(sections.map(x => x.id === s.id ? { ...x, clientEditable: e.target.checked } : x)); startTransition(() => setSectionEditable(businessId, s.id, e.target.checked)) }} />
                Client-editable
              </label>
              <button onClick={() => move(s.id, -1)} disabled={i === 0} style={{ color: 'var(--t3)' }}><ChevronUp size={14} /></button>
              <button onClick={() => move(s.id, 1)} disabled={i === sections.length - 1} style={{ color: 'var(--t3)' }}><ChevronDown size={14} /></button>
              <button onClick={() => startTransition(async () => { await removeSection(businessId, s.id); setSections(sections.filter(x => x.id !== s.id)) })} style={{ color: 'var(--coral)' }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {s.kind === 'text' && (
            <div className="p-5 flex flex-col gap-2">
              <textarea value={drafts[s.id] ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [s.id]: e.target.value }))}
                rows={6} className="w-full rounded-xl px-3.5 py-2.5 text-sm resize-y"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              <button onClick={() => handleSaveSection(s.id)} disabled={isPending}
                className="self-start rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--bg2)', color: 'var(--violet)', border: '1px solid var(--border)' }}>
                Save &amp; push this edit now
              </button>
            </div>
          )}
          {s.kind === 'hours_table' && (
            <div className="p-5 flex flex-col gap-3">
              <HoursSectionField title="Live hours" hours={liveStructured.hours} onChange={() => {}} />
              {structuredChanged && JSON.stringify(canon(draftStructured.hours)) !== JSON.stringify(canon(liveStructured.hours)) && (
                <HoursSectionField title="Pending (client's edit)" hours={draftStructured.hours} onChange={() => {}} />
              )}
            </div>
          )}
          {s.kind === 'services_table' && (
            <div className="p-5 flex flex-col gap-3">
              <ServicesSectionField title="Live services" services={liveStructured.services} onChange={() => {}} />
              {structuredChanged && JSON.stringify(canon(draftStructured.services)) !== JSON.stringify(canon(liveStructured.services)) && (
                <ServicesSectionField title="Pending (client's edit)" services={draftStructured.services} onChange={() => {}} />
              )}
            </div>
          )}
          {s.kind === 'staff_table' && (
            <div className="p-5 flex flex-col gap-3">
              <StaffSectionField title="Live team" staff={liveStructured.staff} businessHours={liveStructured.hours} onChange={() => {}} />
              {structuredChanged && JSON.stringify(canon(draftStructured.staff)) !== JSON.stringify(canon(liveStructured.staff)) && (
                <StaffSectionField title="Pending (client's edit)" staff={draftStructured.staff} businessHours={draftStructured.hours} onChange={() => {}} />
              )}
            </div>
          )}

          <SectionDiff section={s} />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="New section title (e.g. Clinical Boundaries)"
          className="flex-1 rounded-xl px-3.5 py-2.5 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
        <button onClick={handleAdd} disabled={isPending}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--violet)' }}>
          <Plus size={14} /> Add section
        </button>
      </div>
    </div>
  )
}
