'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { saveBriefing, type Hours, type TransferRule, type ServiceDraft, type FaqDraft, type BriefingPayload } from '@/app/(dashboard)/briefing/actions'
import { defaultGreeting } from '@/lib/assistantPrompt'

const DAY_LABELS: { key: keyof Hours; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
]

function fmtCents(cents: number | null) {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

function parseDollars(str: string): number | null {
  const n = parseFloat(str)
  return isNaN(n) ? null : Math.round(n * 100)
}

type Props = {
  businessId: string
  businessName: string
  vapiAssistantId?: string | null
  initialGreeting: string
  initialCustomInstructions: string
  initialHours: Hours
  initialTransferRules: TransferRule[]
  initialServices: ServiceDraft[]
  initialFaqs: FaqDraft[]
  /** Defaults to the client-facing Server Action; the admin route passes its own service-role action here. */
  saveAction?: (businessId: string, payload: BriefingPayload) => Promise<{ warning?: string }>
}

const CUSTOM_INSTRUCTIONS_PLACEHOLDER =
  `e.g. We don't take same-day bookings on Mondays.\nMention our 10% first-time customer discount when quoting prices.\nIf someone asks about parking, tell them there's free 2-hour parking out back.\nWe only service the northern suburbs — politely decline anything further out.`

export default function BriefingEditor({
  businessId, businessName, vapiAssistantId, initialGreeting, initialCustomInstructions,
  initialHours, initialTransferRules, initialServices, initialFaqs,
  saveAction = saveBriefing,
}: Props) {
  const placeholderGreeting                         = defaultGreeting(businessName)
  const [greeting, setGreeting]                     = useState(initialGreeting)
  const [customInstructions, setCustomInstructions] = useState(initialCustomInstructions)
  const [hours, setHours]                           = useState(initialHours)
  const [transferRules, setTransferRules]           = useState(initialTransferRules)
  const [services, setServices]                     = useState(initialServices)
  const [faqs, setFaqs]                              = useState(initialFaqs)
  const [isPending, startTransition]                = useTransition()
  const [status, setStatus]                         = useState<'idle' | 'saved' | 'error'>('idle')
  const [warning, setWarning]                       = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen]                = useState(false)

  function save() {
    setConfirmOpen(false)
    startTransition(async () => {
      try {
        const result = await saveAction(businessId, { greetingScript: greeting, customInstructions, hours, transferRules, services, faqs })
        setStatus('saved')
        setWarning(result.warning ?? null)
        setTimeout(() => setStatus('idle'), 2500)
      } catch {
        setStatus('error')
        setWarning(null)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--text)' }}>
            Ellie&apos;s briefing
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--t3)' }}>What Ellie knows about your business. She uses this on every call.</p>
          {!vapiAssistantId && (
            <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: 'var(--amber)' }}>
              <AlertTriangle size={12} /> Not yet connected to a live Vapi assistant — changes here are saved but won&apos;t affect calls yet.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {status === 'saved' && !warning && <span className="text-sm font-semibold" style={{ color: 'var(--signal)' }}>Saved</span>}
          {status === 'saved' && warning && <span className="text-sm font-semibold" style={{ color: 'var(--amber)' }}>{warning}</span>}
          {status === 'error' && <span className="text-sm font-semibold" style={{ color: 'var(--coral)' }}>Failed to save</span>}
          <button
            onClick={() => vapiAssistantId ? setConfirmOpen(true) : save()}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--violet)' }}
          >
            {isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(23,17,38,0.5)' }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="rounded-2xl p-6 max-w-sm w-full"
            style={{ background: 'var(--bg3)', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
              Update Ellie&apos;s live behaviour?
            </h3>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--t2)' }}>
              This changes what Ellie says on real calls right away — her greeting, what she knows, and when she transfers callers to you.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: 'var(--violet)' }}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="flex flex-col gap-4">

          {/* Greeting */}
          <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Greeting</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>The first thing every caller hears</p>
            </div>
            <div className="p-5">
              <textarea
                value={greeting}
                onChange={e => setGreeting(e.target.value)}
                placeholder={placeholderGreeting}
                rows={3}
                className="w-full rounded-xl p-3 text-sm"
                style={{ border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }}
              />
              <div className="rounded-xl p-3.5 mt-3" style={{ background: 'var(--night)', color: '#DCD6EC' }}>
                <b className="block text-[0.65rem] tracking-widest mb-1.5" style={{ color: 'var(--signal)' }}>ELLIE WILL SAY</b>
                <span className="text-sm italic leading-relaxed">&quot;{greeting.trim() || placeholderGreeting}&quot;</span>
              </div>
            </div>
          </section>

          {/* Services */}
          <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Services &amp; prices</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Ellie quotes these when callers ask</p>
              </div>
              <button
                onClick={() => setServices(s => [...s, { name: '', durationMinutes: 30, priceCents: 0 }])}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <Plus size={12} /> Add
              </button>
            </div>
            {services.length === 0 && <p className="px-5 py-6 text-sm" style={{ color: 'var(--t3)' }}>No services added yet</p>}
            {services.map((svc, i) => (
              <div key={i} className="flex items-center gap-2 px-5 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <input
                  value={svc.name}
                  onChange={e => setServices(s => s.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder="Service name"
                  className="flex-1 text-sm rounded-lg px-2.5 py-1.5 min-w-0"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <input
                  type="number"
                  value={svc.durationMinutes ?? ''}
                  onChange={e => setServices(s => s.map((x, j) => j === i ? { ...x, durationMinutes: e.target.value ? parseInt(e.target.value) : null } : x))}
                  placeholder="Min"
                  className="w-16 text-sm rounded-lg px-2 py-1.5 font-mono"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <input
                  value={fmtCents(svc.priceCents)}
                  onChange={e => setServices(s => s.map((x, j) => j === i ? { ...x, priceCents: parseDollars(e.target.value) } : x))}
                  placeholder="$"
                  className="w-20 text-sm rounded-lg px-2 py-1.5 font-mono"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <button onClick={() => setServices(s => s.filter((_, j) => j !== i))} className="shrink-0" style={{ color: 'var(--coral)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </section>

          {/* Custom instructions — catch-all for anything the structured fields don't cover */}
          <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Custom instructions</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
                Anything specific to your business that isn&apos;t covered above — policies, discounts, service areas, whatever Ellie should know.
              </p>
            </div>
            <div className="p-5">
              <textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                placeholder={CUSTOM_INSTRUCTIONS_PLACEHOLDER}
                rows={6}
                className="w-full rounded-xl p-3 text-sm"
                style={{ border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }}
              />
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4">

          {/* Hours */}
          <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Business hours</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Outside these, Ellie still answers and books for the next open day</p>
            </div>
            {DAY_LABELS.map(({ key, label }, i) => {
              const d = hours[key]
              return (
                <div key={key} className="flex items-center gap-3 px-5 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <b className="w-10 text-sm font-semibold" style={{ color: 'var(--t2)' }}>{label}</b>
                  {d.open ? (
                    <div className="flex items-center gap-1.5 flex-1 font-mono text-sm" style={{ color: 'var(--text)' }}>
                      <input type="time" value={d.opensAt}
                        onChange={e => setHours(h => ({ ...h, [key]: { ...d, opensAt: e.target.value } }))}
                        className="rounded-lg px-1.5 py-1" style={{ border: '1px solid var(--border)' }} />
                      <span style={{ color: 'var(--t3)' }}>–</span>
                      <input type="time" value={d.closesAt}
                        onChange={e => setHours(h => ({ ...h, [key]: { ...d, closesAt: e.target.value } }))}
                        className="rounded-lg px-1.5 py-1" style={{ border: '1px solid var(--border)' }} />
                    </div>
                  ) : (
                    <span className="flex-1 text-sm italic" style={{ color: 'var(--t3)' }}>Closed</span>
                  )}
                  <button
                    onClick={() => setHours(h => ({ ...h, [key]: { ...d, open: !d.open } }))}
                    role="switch" aria-checked={d.open}
                    className="w-[38px] h-[22px] rounded-full relative shrink-0"
                    style={{ background: d.open ? 'var(--signal)' : 'var(--border)' }}
                  >
                    <span className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all" style={{ left: d.open ? 19 : 3 }} />
                  </button>
                </div>
              )
            })}
          </section>

          {/* FAQs */}
          <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Questions Ellie can answer</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Her go-to answers for common questions</p>
              </div>
              <button
                onClick={() => setFaqs(f => [...f, { question: '', answer: '' }])}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <Plus size={12} /> Add
              </button>
            </div>
            {faqs.length === 0 && <p className="px-5 py-6 text-sm" style={{ color: 'var(--t3)' }}>No questions added yet</p>}
            {faqs.map((faq, i) => (
              <div key={i} className="flex flex-col gap-1.5 px-5 py-3" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div className="flex items-center gap-2">
                  <input
                    value={faq.question}
                    onChange={e => setFaqs(f => f.map((x, j) => j === i ? { ...x, question: e.target.value } : x))}
                    placeholder="Question"
                    className="flex-1 text-sm font-semibold rounded-lg px-2.5 py-1.5 min-w-0"
                    style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <button onClick={() => setFaqs(f => f.filter((_, j) => j !== i))} className="shrink-0" style={{ color: 'var(--coral)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  value={faq.answer}
                  onChange={e => setFaqs(f => f.map((x, j) => j === i ? { ...x, answer: e.target.value } : x))}
                  placeholder="Ellie's answer"
                  rows={2}
                  className="text-sm rounded-lg px-2.5 py-1.5"
                  style={{ border: '1px solid var(--border)', color: 'var(--t2)', resize: 'vertical' }}
                />
              </div>
            ))}
          </section>

          {/* Transfer rules */}
          <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>When to put callers through to you</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Ellie handles everything else herself</p>
            </div>
            {transferRules.map((rule, i) => (
              <div key={rule.label} className="flex items-center gap-3.5 px-5 py-3.5" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div className="flex-1">
                  <b className="block text-sm font-semibold" style={{ color: 'var(--text)' }}>{rule.label}</b>
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--t3)' }}>{rule.description}</span>
                </div>
                <button
                  onClick={() => setTransferRules(rules => rules.map((r, j) => j === i ? { ...r, enabled: !r.enabled } : r))}
                  role="switch" aria-checked={rule.enabled}
                  className="w-[38px] h-[22px] rounded-full relative shrink-0"
                  style={{ background: rule.enabled ? 'var(--signal)' : 'var(--border)' }}
                >
                  <span className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all" style={{ left: rule.enabled ? 19 : 3 }} />
                </button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
