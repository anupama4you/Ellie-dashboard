import type { ReactNode } from 'react'
import type { Hours, BriefingPayload } from '@/app/(dashboard)/briefing/actions'
import { defaultGreeting } from '@/lib/assistantPrompt'

const DAY_LABELS: { key: keyof Hours; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
]

function fmtCents(cents: number | null) {
  if (cents == null) return null
  return `$${(cents / 100).toFixed(2)}`
}

/** Draft ids are stale/incidental (array-index-keyed in the editor) while live ids are real DB UUIDs — strip before diffing so real edits aren't masked by id noise. */
function stripIds<T extends { id?: string }>(arr: T[]): Omit<T, 'id'>[] {
  return arr.map(item => {
    const copy: Record<string, unknown> = { ...item }
    delete copy.id
    return copy as Omit<T, 'id'>
  })
}

function ChangedPill({ show }: { show: boolean | undefined }) {
  if (!show) return null
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
      style={{ color: 'var(--amber)', background: 'rgba(217,138,11,0.12)' }}>
      Changed
    </span>
  )
}

type Props = {
  businessName: string
  hasDraft: boolean
  draft: BriefingPayload
  live: BriefingPayload
  /** Company Information is admin-editable (AdminCompanyInfoEditor), not rendered by this component — injected as the first left-column section. */
  companyInfoSlot: ReactNode
}

export default function BriefingReadOnly({ businessName, hasDraft, draft, live, companyInfoSlot }: Props) {
  const { greetingScript: greeting, customInstructions, hours, transferRules, transferPhoneNumber, services, faqs } = draft
  const placeholderGreeting = defaultGreeting(businessName)

  const changed = hasDraft ? {
    greeting: greeting.trim() !== live.greetingScript.trim(),
    services: JSON.stringify(stripIds(services)) !== JSON.stringify(stripIds(live.services)),
    customInstructions: customInstructions.trim() !== live.customInstructions.trim(),
    hours: JSON.stringify(hours) !== JSON.stringify(live.hours),
    faqs: JSON.stringify(stripIds(faqs)) !== JSON.stringify(stripIds(live.faqs)),
    transferRules: JSON.stringify(transferRules) !== JSON.stringify(live.transferRules),
    transferPhoneNumber: transferPhoneNumber.trim() !== live.transferPhoneNumber.trim(),
  } : null

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="flex flex-col gap-4">

        {companyInfoSlot}

        {/* Greeting */}
        <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Greeting</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>What the client wants Ellie to open with</p>
            </div>
            <ChangedPill show={changed?.greeting} />
          </div>
          <div className="p-5">
            <div className="rounded-xl p-3.5" style={{ background: 'var(--night)', color: '#DCD6EC' }}>
              <span className="text-sm italic leading-relaxed">&quot;{greeting.trim() || placeholderGreeting}&quot;</span>
            </div>
          </div>
        </section>

        {/* Services */}
        <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Services &amp; prices</h2>
            <ChangedPill show={changed?.services} />
          </div>
          {services.length === 0 && <p className="px-5 py-6 text-sm" style={{ color: 'var(--t3)' }}>No services added</p>}
          {services.map((svc, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, color: 'var(--text)' }}>
              <span className="flex-1 font-semibold">{svc.name || '—'}</span>
              {svc.durationMinutes != null && <span style={{ color: 'var(--t3)' }}>{svc.durationMinutes} min</span>}
              {fmtCents(svc.priceCents) && <span className="font-mono" style={{ color: 'var(--t2)' }}>{fmtCents(svc.priceCents)}</span>}
            </div>
          ))}
        </section>

        {/* Custom instructions */}
        <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Custom instructions</h2>
            <ChangedPill show={changed?.customInstructions} />
          </div>
          <div className="p-5">
            <p className="text-sm whitespace-pre-wrap" style={{ color: customInstructions.trim() ? 'var(--text)' : 'var(--t3)' }}>
              {customInstructions.trim() || 'None provided.'}
            </p>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-4">

        {/* Hours */}
        <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Business hours</h2>
            <ChangedPill show={changed?.hours} />
          </div>
          {DAY_LABELS.map(({ key, label }, i) => {
            const d = hours[key]
            return (
              <div key={key} className="flex items-center gap-3 px-5 py-2.5 text-sm" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <b className="w-10 font-semibold" style={{ color: 'var(--t2)' }}>{label}</b>
                <span className="font-mono" style={{ color: d.open ? 'var(--text)' : 'var(--t3)' }}>
                  {d.open ? `${d.opensAt} – ${d.closesAt}` : 'Closed'}
                </span>
              </div>
            )
          })}
        </section>

        {/* FAQs */}
        <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Questions Ellie can answer</h2>
            <ChangedPill show={changed?.faqs} />
          </div>
          {faqs.length === 0 && <p className="px-5 py-6 text-sm" style={{ color: 'var(--t3)' }}>No questions added</p>}
          {faqs.map((faq, i) => (
            <div key={i} className="flex flex-col gap-1 px-5 py-3 text-sm" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <b style={{ color: 'var(--text)' }}>{faq.question}</b>
              <span style={{ color: 'var(--t2)' }}>{faq.answer}</span>
            </div>
          ))}
        </section>

        {/* Transfer rules */}
        <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>When to put callers through</h2>
            <ChangedPill show={changed?.transferRules} />
          </div>
          {transferRules.map((rule, i) => (
            <div key={rule.label} className="flex items-center gap-3.5 px-5 py-3.5 text-sm" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: rule.enabled ? 'var(--signal)' : 'var(--t6)' }} />
              <div className="flex-1">
                <b style={{ color: 'var(--text)' }}>{rule.label}</b>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--t3)' }}>{rule.description}</span>
              </div>
              <span className="text-xs font-semibold" style={{ color: rule.enabled ? 'var(--signal)' : 'var(--t4)' }}>
                {rule.enabled ? 'Enabled' : 'Off'}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <b style={{ color: 'var(--text)' }}>Transfer number</b>
              <span className="block text-xs mt-0.5" style={{ color: transferPhoneNumber.trim() ? 'var(--text)' : 'var(--t3)' }}>
                {transferPhoneNumber.trim() || 'Not set — Ellie takes a message instead'}
              </span>
            </div>
            <ChangedPill show={changed?.transferPhoneNumber} />
          </div>
        </section>
      </div>
    </div>
  )
}
