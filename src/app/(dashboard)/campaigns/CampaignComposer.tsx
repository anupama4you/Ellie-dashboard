'use client'

import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { extractCustomVariableNames } from '@/lib/outboundCsv'
import CsvDropzone from './CsvDropzone'

const FIXED_VARIABLES = [
  { key: 'customerName', label: 'Customer name' },
  { key: 'note', label: 'Note' },
]

type Props = {
  action: (formData: FormData) => void
  defaultFirstMessage: string
  defaultSystemPrompt: string
}

/**
 * Owns the whole "New campaign" form as a client component (rather than
 * plain server-rendered inputs) because the "insert a personal detail"
 * buttons need to write into whichever of the two textareas the client
 * last focused, at the actual cursor position — that needs controlled
 * inputs + refs, which a Server Component can't provide. Still submits
 * through the same <form action={createCampaignAction}> Server Action;
 * nothing here talks to the network itself.
 */
export default function CampaignComposer({ action, defaultFirstMessage, defaultSystemPrompt }: Props) {
  const [firstMessage, setFirstMessage] = useState(defaultFirstMessage)
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt)
  const [customVariables, setCustomVariables] = useState<string[]>([])
  const [activeField, setActiveField] = useState<'firstMessage' | 'systemPrompt'>('firstMessage')

  const firstMessageRef = useRef<HTMLTextAreaElement>(null)
  const systemPromptRef = useRef<HTMLTextAreaElement>(null)

  async function handleFile(file: File | null) {
    if (!file) { setCustomVariables([]); return }
    const text = await file.text()
    setCustomVariables(extractCustomVariableNames(text))
  }

  function insertVariable(key: string) {
    const token = `{{${key}}}`
    const isFirstMessage = activeField === 'firstMessage'
    const el = (isFirstMessage ? firstMessageRef : systemPromptRef).current
    const setValue = isFirstMessage ? setFirstMessage : setSystemPrompt
    if (!el) return

    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const next = el.value.slice(0, start) + token + el.value.slice(end)
    setValue(next)

    // Re-focus and place the cursor after the inserted token — has to wait
    // a tick for the controlled value above to actually reach the DOM.
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  const allVariables = [...FIXED_VARIABLES, ...customVariables.map(key => ({ key, label: key }))]

  return (
    <form action={action} className="p-5 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Campaign name</label>
        <input type="text" name="name" required placeholder="Spring re-engagement" className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="campaign-first-message" className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Opening line</label>
        <textarea
          id="campaign-first-message" name="firstMessage" required rows={2}
          ref={firstMessageRef}
          value={firstMessage}
          onFocus={() => setActiveField('firstMessage')}
          onChange={e => setFirstMessage(e.target.value)}
          placeholder="Hi, this is Ellie calling from [Business]."
          className="rounded-lg px-3 py-2 text-sm resize-y" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>What Ellie says the moment the call connects.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="campaign-system-prompt" className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>How should Ellie behave on these calls?</label>
        <textarea
          id="campaign-system-prompt" name="systemPrompt" required rows={4}
          ref={systemPromptRef}
          value={systemPrompt}
          onFocus={() => setActiveField('systemPrompt')}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="Mention it's been a while since their last visit, and offer to book them in this week."
          className="rounded-lg px-3 py-2 text-sm resize-y" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Pre-filled with your usual script — edit it for this campaign if you want.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Insert a personal detail</p>
        <div className="flex flex-wrap gap-1.5">
          {allVariables.map(v => (
            <button key={v.key} type="button" onClick={() => insertVariable(v.key)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-full transition-opacity hover:opacity-80"
              style={{ color: 'var(--violet)', background: 'var(--violet-soft)' }}>
              + {v.label}
            </button>
          ))}
        </div>
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          Click into the field above you want, then tap a detail to drop it in — Ellie fills in the real value for each contact automatically.
          {customVariables.length === 0 && ' Upload your CSV below to see details from your own columns here too.'}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="campaign-csv" className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Contacts CSV</label>
        <CsvDropzone inputId="campaign-csv" onFileSelected={handleFile} />
      </div>

      <button type="submit" className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
        style={{ background: 'var(--violet)' }}>
        <span className="flex items-center gap-1.5"><Plus size={14} /> Create campaign</span>
      </button>
    </form>
  )
}
