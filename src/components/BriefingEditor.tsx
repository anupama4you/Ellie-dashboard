'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { saveBriefing, type Hours, type ServiceDraft, type FaqDraft, type CompanyInfo } from '@/app/(dashboard)/briefing/actions'
import { defaultGreeting } from '@/lib/assistantPrompt'

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']

const DAY_LABELS: { key: keyof Hours; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
]

// Services are edited with the price kept as a raw dollar string (not cents)
// so the input can be typed freely — round-tripping every keystroke through
// cents and reformatting to a fixed "x.00" shape (the old approach) fights
// the cursor and makes it impossible to type more than one digit.
type ServiceRow = { id?: string; name: string; durationMinutes: number | null; price: string }

function toServiceRow(s: ServiceDraft): ServiceRow {
  return { id: s.id, name: s.name, durationMinutes: s.durationMinutes, price: s.priceCents != null ? (s.priceCents / 100).toFixed(2) : '' }
}

function toServiceDraft(r: ServiceRow): ServiceDraft {
  const n = parseFloat(r.price)
  return { id: r.id, name: r.name, durationMinutes: r.durationMinutes, priceCents: isNaN(n) ? null : Math.round(n * 100) }
}

/** Only ever lets a valid partial decimal (whole dollars, or up to 2 decimal places) through. */
const PRICE_INPUT_RE = /^\d*\.?\d{0,2}$/

type Props = {
  businessId: string
  businessName: string
  initialGreeting: string
  initialCustomInstructions: string
  initialHours: Hours
  initialTransferRules: string
  initialTransferPhoneNumber: string
  initialServices: ServiceDraft[]
  initialFaqs: FaqDraft[]
  initialCompanyInfo: CompanyInfo
  isPendingReview?: boolean
}

const CUSTOM_INSTRUCTIONS_PLACEHOLDER =
  `e.g. We don't take same-day bookings on Mondays.\nMention our 10% first-time customer discount when quoting prices.\nIf someone asks about parking, tell them there's free 2-hour parking out back.\nWe only service the northern suburbs — politely decline anything further out.`

const TRANSFER_INSTRUCTIONS_PLACEHOLDER =
  `e.g. Put the caller through if they ask for me by name.\nIf someone has a complaint or sounds unhappy, take a message and text me a summary straight away.\nPolitely decline media enquiries and sales calls — don't put those through.`

export default function BriefingEditor({
  businessId, businessName, initialGreeting, initialCustomInstructions,
  initialHours, initialTransferRules, initialTransferPhoneNumber, initialServices, initialFaqs, initialCompanyInfo,
  isPendingReview,
}: Props) {
  const placeholderGreeting                         = defaultGreeting(businessName)
  const [greeting, setGreeting]                     = useState(initialGreeting)
  const [customInstructions, setCustomInstructions] = useState(initialCustomInstructions)
  const [hours, setHours]                           = useState(initialHours)
  const [transferRules, setTransferRules]           = useState(initialTransferRules)
  const [transferPhoneNumber, setTransferPhoneNumber] = useState(initialTransferPhoneNumber)
  const [services, setServices]                     = useState(() => initialServices.map(toServiceRow))
  const [faqs, setFaqs]                              = useState(initialFaqs)
  const [companyInfo, setCompanyInfo]               = useState(initialCompanyInfo)
  const [isPending, startTransition]                = useTransition()
  const [status, setStatus]                         = useState<'idle' | 'saved' | 'error'>('idle')

  function save() {
    startTransition(async () => {
      try {
        await saveBriefing(businessId, { greetingScript: greeting, customInstructions, hours, transferRules, transferPhoneNumber, services: services.map(toServiceDraft), faqs, companyInfo })
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2500)
      } catch {
        setStatus('error')
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--text)' }}>
            Company Information
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--t3)' }}>Your business profile, and what Ellie knows when she answers calls.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
            {isPendingReview
              ? 'You have changes pending review — this is what you last submitted, not yet live on real calls.'
              : 'Changes here are reviewed by our team before they go live on real calls.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status === 'saved' && <span className="text-sm font-semibold" style={{ color: 'var(--signal)' }}>Saved — your changes will be reviewed and added to Ellie shortly</span>}
          {status === 'error' && <span className="text-sm font-semibold" style={{ color: 'var(--coral)' }}>Failed to save</span>}
          <button
            onClick={save}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--violet)' }}
          >
            {isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="flex flex-col gap-4">

          {/* Company Information */}
          <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Company Information</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Tell Ellie (and us) about your business</p>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Business name</span>
                <div className="text-sm rounded-xl px-3 py-2" style={{ border: '1px solid var(--border)', color: 'var(--t3)', background: 'var(--bg2)' }}>
                  {businessName}
                </div>
                <span className="text-xs" style={{ color: 'var(--t4)' }}>Contact your Ellie account manager to change your business name.</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Description</span>
                <textarea
                  value={companyInfo.description}
                  onChange={e => setCompanyInfo(c => ({ ...c, description: e.target.value }))}
                  placeholder="A couple of sentences about what your business does"
                  rows={3}
                  className="w-full rounded-xl p-3 text-sm"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Website</span>
                <input
                  value={companyInfo.website}
                  onChange={e => setCompanyInfo(c => ({ ...c, website: e.target.value }))}
                  placeholder="https://yourbusiness.com.au"
                  className="w-full text-sm rounded-xl px-3 py-2"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Street address</span>
                <input
                  value={companyInfo.address}
                  onChange={e => setCompanyInfo(c => ({ ...c, address: e.target.value }))}
                  placeholder="123 Example St"
                  className="w-full text-sm rounded-xl px-3 py-2"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div className="grid gap-2" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>City</span>
                  <input
                    value={companyInfo.city}
                    onChange={e => setCompanyInfo(c => ({ ...c, city: e.target.value }))}
                    placeholder="Adelaide"
                    className="w-full text-sm rounded-xl px-3 py-2"
                    style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>State</span>
                  <select
                    value={companyInfo.state}
                    onChange={e => setCompanyInfo(c => ({ ...c, state: e.target.value }))}
                    className="w-full text-sm rounded-xl px-3 py-2"
                    style={{ border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--bg3)' }}
                  >
                    <option value="">—</option>
                    {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Postcode</span>
                  <input
                    value={companyInfo.postcode}
                    onChange={e => setCompanyInfo(c => ({ ...c, postcode: e.target.value }))}
                    placeholder="5000"
                    className="w-full text-sm rounded-xl px-3 py-2"
                    style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Google Maps link</span>
                <input
                  value={companyInfo.googleMapsUrl}
                  onChange={e => setCompanyInfo(c => ({ ...c, googleMapsUrl: e.target.value }))}
                  placeholder="https://maps.app.goo.gl/..."
                  className="w-full text-sm rounded-xl px-3 py-2"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <span className="text-xs" style={{ color: 'var(--t4)' }}>
                  Open your business on Google Maps, tap Share, and paste the link here — included in booking confirmation texts.
                </span>
              </div>
            </div>
          </section>

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
                onClick={() => setServices(s => [...s, { name: '', durationMinutes: 30, price: '' }])}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <Plus size={12} /> Add
              </button>
            </div>
            {services.length === 0 && <p className="px-5 py-6 text-sm" style={{ color: 'var(--t3)' }}>No services added yet</p>}
            {services.length > 0 && (
              <div className="flex items-center gap-2 px-5 pt-3">
                <span className="flex-1 text-[0.65rem] font-bold tracking-wide" style={{ color: 'var(--t4)' }}>SERVICE</span>
                <span className="w-24 text-[0.65rem] font-bold tracking-wide" style={{ color: 'var(--t4)' }}>DURATION</span>
                <span className="w-24 text-[0.65rem] font-bold tracking-wide" style={{ color: 'var(--t4)' }}>PRICE</span>
                <span className="w-3.5 shrink-0" aria-hidden />
              </div>
            )}
            {services.map((svc, i) => (
              <div key={i} className="flex items-center gap-2 px-5 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <input
                  value={svc.name}
                  onChange={e => setServices(s => s.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder="Service name"
                  className="flex-1 text-sm rounded-lg px-2.5 py-1.5 min-w-0"
                  style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <div className="w-24 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={svc.durationMinutes ?? ''}
                    onChange={e => setServices(s => s.map((x, j) => j === i ? { ...x, durationMinutes: e.target.value ? parseInt(e.target.value) : null } : x))}
                    placeholder="30"
                    className="w-full min-w-0 text-sm rounded-lg px-2 py-1.5 font-mono"
                    style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <span className="text-xs shrink-0" style={{ color: 'var(--t3)' }}>min</span>
                </div>
                <div className="w-24 flex items-center gap-1">
                  <span className="text-sm shrink-0" style={{ color: 'var(--t3)' }}>$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={svc.price}
                    onChange={e => {
                      const v = e.target.value
                      if (PRICE_INPUT_RE.test(v)) setServices(s => s.map((x, j) => j === i ? { ...x, price: v } : x))
                    }}
                    onBlur={() => setServices(s => s.map((x, j) => j === i && x.price ? { ...x, price: (parseFloat(x.price) || 0).toFixed(2) } : x))}
                    placeholder="0.00"
                    className="w-full min-w-0 text-sm rounded-lg px-2 py-1.5 font-mono"
                    style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
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
                        onChange={e => setHours(h => ({ ...h, [key]: { ...h[key], opensAt: e.target.value } }))}
                        className="rounded-lg px-1.5 py-1" style={{ border: '1px solid var(--border)' }} />
                      <span style={{ color: 'var(--t3)' }}>–</span>
                      <input type="time" value={d.closesAt}
                        onChange={e => setHours(h => ({ ...h, [key]: { ...h[key], closesAt: e.target.value } }))}
                        className="rounded-lg px-1.5 py-1" style={{ border: '1px solid var(--border)' }} />
                    </div>
                  ) : (
                    <span className="flex-1 text-sm italic" style={{ color: 'var(--t3)' }}>Closed</span>
                  )}
                  <button
                    onClick={() => setHours(h => ({ ...h, [key]: { ...h[key], open: !h[key].open } }))}
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
              <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Describe in your own words when Ellie should connect a caller to you — she handles everything else herself</p>
            </div>
            <div className="p-5">
              <textarea
                value={transferRules}
                onChange={e => setTransferRules(e.target.value)}
                placeholder={TRANSFER_INSTRUCTIONS_PLACEHOLDER}
                rows={5}
                className="w-full rounded-xl p-3 text-sm"
                style={{ border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }}
              />
            </div>
            <div className="flex flex-col gap-1.5 px-5 py-3.5" style={{ borderTop: '1px solid var(--border)' }}>
              <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Number to transfer calls to</label>
              <span className="text-xs" style={{ color: 'var(--t3)' }}>
                When one of the above situations comes up, Ellie connects the caller to this number. Leave blank and she&apos;ll take a message instead.
              </span>
              <input
                type="tel"
                value={transferPhoneNumber}
                onChange={e => setTransferPhoneNumber(e.target.value)}
                placeholder="e.g. 0412 345 678"
                className="text-sm rounded-lg px-2.5 py-1.5 mt-1"
                style={{ border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--bg2)' }}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
