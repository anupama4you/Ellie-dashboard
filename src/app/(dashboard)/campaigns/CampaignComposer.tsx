'use client'

import { useRef, useState, useTransition } from 'react'
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { extractCustomVariableNames, parseContactsCsv } from '@/lib/outboundCsv'
import CsvDropzone from './CsvDropzone'

const FIXED_VARIABLES = [
  { key: 'customerName', label: 'Customer name' },
  { key: 'note', label: 'Note' },
]

const STEPS = [
  { n: 1, label: 'Details' },
  { n: 2, label: 'Contacts' },
  { n: 3, label: 'Review' },
] as const

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
 * through the same createCampaignAction Server Action; nothing here talks
 * to the network itself.
 *
 * All three steps stay mounted in the DOM at once (just hidden via CSS)
 * instead of being conditionally rendered — that keeps the textarea refs
 * alive so "insert a personal detail" still works after navigating away
 * from step 1, and keeps every field's value intact when moving back and
 * forth between steps.
 */
export default function CampaignComposer({ action, defaultFirstMessage, defaultSystemPrompt }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [stepError, setStepError] = useState('')

  const [name, setName] = useState('')
  const [firstMessage, setFirstMessage] = useState(defaultFirstMessage)
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt)
  const [activeField, setActiveField] = useState<'firstMessage' | 'systemPrompt'>('firstMessage')

  const [customVariables, setCustomVariables] = useState<string[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [contactCount, setContactCount] = useState<number | null>(null)

  const [consented, setConsented] = useState(false)
  const [isPending, startTransition] = useTransition()

  const formRef = useRef<HTMLFormElement>(null)
  const firstMessageRef = useRef<HTMLTextAreaElement>(null)
  const systemPromptRef = useRef<HTMLTextAreaElement>(null)

  async function handleFile(file: File | null) {
    if (!file) { setFileName(null); setCustomVariables([]); setContactCount(null); return }
    const text = await file.text()
    setFileName(file.name)
    setCustomVariables(extractCustomVariableNames(text))
    setContactCount(parseContactsCsv(text).valid.length)
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

  function goNext() {
    setStepError('')
    if (step === 1) {
      if (!name.trim() || !firstMessage.trim() || !systemPrompt.trim()) {
        setStepError('Fill in the campaign name, opening line, and behavior before continuing.')
        return
      }
    } else if (step === 2) {
      if (!fileName) {
        setStepError('Choose a CSV file to upload.')
        return
      }
    }
    setStep(s => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))
  }

  function goBack() {
    setStepError('')
    setStep(s => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))
  }

  function confirmCreate() {
    if (!formRef.current) return
    const formData = new FormData(formRef.current)
    formData.set('consent', 'true')
    startTransition(() => {
      action(formData)
    })
  }

  return (
    <form ref={formRef} onSubmit={e => e.preventDefault()} className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-center">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center" style={{ flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: step >= s.n ? 'var(--violet)' : 'var(--paper)',
                  color: step >= s.n ? '#fff' : 'var(--ink-3)',
                  border: step >= s.n ? 'none' : '1px solid var(--line)',
                }}
              >
                {step > s.n ? <Check size={13} /> : s.n}
              </div>
              <span className="text-xs font-semibold whitespace-nowrap" style={{ color: step === s.n ? 'var(--ink)' : 'var(--ink-3)' }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="h-px flex-1 mx-2 mb-4" style={{ background: step > s.n ? 'var(--violet)' : 'var(--line)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 — Details */}
      <div className="flex flex-col gap-3" hidden={step !== 1}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="campaign-name" className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Campaign name</label>
          <input id="campaign-name" type="text" name="name" value={name} onChange={e => setName(e.target.value)}
            placeholder="Spring re-engagement" className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="campaign-first-message" className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Opening line</label>
          <textarea
            id="campaign-first-message" name="firstMessage" rows={2}
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
            id="campaign-system-prompt" name="systemPrompt" rows={4}
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
            {customVariables.length === 0 && ' Upload your CSV on the next step to see details from your own columns here too.'}
          </p>
        </div>
      </div>

      {/* Step 2 — Contacts */}
      <div className="flex flex-col gap-1.5" hidden={step !== 2}>
        <label htmlFor="campaign-csv" className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Contacts CSV</label>
        <CsvDropzone inputId="campaign-csv" onFileSelected={handleFile} />
        {contactCount !== null && (
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{contactCount} valid contact{contactCount === 1 ? '' : 's'} found in {fileName}.</p>
        )}
      </div>

      {/* Step 3 — Review */}
      <div className="flex flex-col gap-3" hidden={step !== 3}>
        <div className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Campaign</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{name || 'Untitled campaign'}</p>
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Opening line</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-2)' }}>{firstMessage}</p>
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Behavior</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-2)' }}>{systemPrompt}</p>
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Contacts</p>
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              {contactCount !== null ? `${contactCount} valid contact${contactCount === 1 ? '' : 's'}` : 'No file uploaded'} from {fileName ?? '—'}
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)} className="mt-0.5" />
          These are my own existing customers and I have the right to contact them.
        </label>
      </div>

      {stepError && <p className="text-xs" style={{ color: 'var(--coral)' }}>{stepError}</p>}

      <div className="flex items-center justify-between mt-1">
        <button type="button" onClick={goBack} disabled={step === 1}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-0 transition-opacity"
          style={{ color: 'var(--ink-3)' }}>
          <ChevronLeft size={14} /> Back
        </button>

        {step < 3 ? (
          <button type="button" onClick={goNext}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--violet)' }}>
            Next <ChevronRight size={14} />
          </button>
        ) : (
          <button type="button" onClick={confirmCreate} disabled={!consented || isPending}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: 'var(--violet)' }}>
            <Plus size={14} /> {isPending ? 'Creating…' : 'Create campaign'}
          </button>
        )}
      </div>
    </form>
  )
}
