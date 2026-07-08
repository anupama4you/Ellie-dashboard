import type { Hours, TransferRule, ServiceDraft, FaqDraft, CompanyInfo } from '@/app/(dashboard)/briefing/actions'
import { defaultGreeting } from '@/lib/assistantPrompt'

const DAY_LABELS: { key: keyof Hours; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
]

function fmtCents(cents: number | null) {
  if (cents == null) return null
  return `$${(cents / 100).toFixed(2)}`
}

type Props = {
  businessName: string
  greeting: string
  customInstructions: string
  hours: Hours
  transferRules: TransferRule[]
  services: ServiceDraft[]
  faqs: FaqDraft[]
  companyInfo: CompanyInfo
}

export default function BriefingReadOnly({
  businessName, greeting, customInstructions, hours, transferRules, services, faqs, companyInfo,
}: Props) {
  const placeholderGreeting = defaultGreeting(businessName)
  const location = [companyInfo.address, companyInfo.city, companyInfo.state, companyInfo.postcode].filter(Boolean).join(', ')

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="flex flex-col gap-4">

        {/* Company Information */}
        <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Company Information</h2>
          </div>
          <div className="p-5 flex flex-col gap-3 text-sm">
            <div>
              <span className="text-xs font-semibold block" style={{ color: 'var(--t3)' }}>Description</span>
              <p style={{ color: companyInfo.description.trim() ? 'var(--text)' : 'var(--t3)' }}>
                {companyInfo.description.trim() || 'None provided.'}
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold block" style={{ color: 'var(--t3)' }}>Website</span>
              <p style={{ color: companyInfo.website.trim() ? 'var(--text)' : 'var(--t3)' }}>
                {companyInfo.website.trim() || '—'}
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold block" style={{ color: 'var(--t3)' }}>Location</span>
              <p style={{ color: location ? 'var(--text)' : 'var(--t3)' }}>
                {location || '—'}
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold block" style={{ color: 'var(--t3)' }}>Google Maps link</span>
              {companyInfo.googleMapsUrl.trim() ? (
                <a href={companyInfo.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                  className="underline break-all" style={{ color: 'var(--violet)' }}>
                  {companyInfo.googleMapsUrl}
                </a>
              ) : (
                <p style={{ color: 'var(--t3)' }}>—</p>
              )}
            </div>
          </div>
        </section>

        {/* Greeting */}
        <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Greeting</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>What the client wants Ellie to open with</p>
          </div>
          <div className="p-5">
            <div className="rounded-xl p-3.5" style={{ background: 'var(--night)', color: '#DCD6EC' }}>
              <span className="text-sm italic leading-relaxed">&quot;{greeting.trim() || placeholderGreeting}&quot;</span>
            </div>
          </div>
        </section>

        {/* Services */}
        <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Services &amp; prices</h2>
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
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Custom instructions</h2>
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
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Business hours</h2>
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
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Questions Ellie can answer</h2>
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
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>When to put callers through</h2>
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
        </section>
      </div>
    </div>
  )
}
