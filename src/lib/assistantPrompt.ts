import type { Hours, TransferRule } from '@/app/(dashboard)/briefing/actions'

type ServiceInput = { name: string; durationMinutes: number | null; priceCents: number | null }
type FaqInput = { question: string; answer: string }

const DAY_LABEL: Record<keyof Hours, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}
const DAY_ORDER: (keyof Hours)[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function fmtHours(hours: Hours): string {
  return DAY_ORDER.map(day => {
    const d = hours[day]
    const label = DAY_LABEL[day]
    return d.open ? `${label}: ${d.opensAt} – ${d.closesAt}` : `${label}: Closed`
  }).join('\n')
}

function fmtServices(services: ServiceInput[]): string {
  if (services.length === 0) return '(No services configured yet.)'
  return services.map(s => {
    const duration = s.durationMinutes ? ` (${s.durationMinutes} min)` : ''
    const price = s.priceCents != null ? ` — $${(s.priceCents / 100).toFixed(2)}` : ''
    return `- ${s.name}${duration}${price}`
  }).join('\n')
}

function fmtFaqs(faqs: FaqInput[]): string {
  if (faqs.length === 0) return '(No common questions configured yet.)'
  return faqs.map(f => `- Q: ${f.question}\n  A: ${f.answer}`).join('\n')
}

function fmtTransferRules(rules: TransferRule[]): string {
  const enabled = rules.filter(r => r.enabled)
  if (enabled.length === 0) return '(No transfer rules — handle every call yourself.)'
  return enabled.map(r => `- ${r.label}: ${r.description}`).join('\n')
}

type CompanyInfoInput = {
  description?: string
  website?: string
  address?: string
  city?: string
  state?: string
  postcode?: string
}

function fmtCompanyInfo(info?: CompanyInfoInput): string {
  const lines: string[] = []
  if (info?.description?.trim()) lines.push(info.description.trim())
  const location = [info?.address, info?.city, info?.state, info?.postcode].filter(Boolean).join(', ')
  if (location) lines.push(`Location: ${location}`)
  if (info?.website?.trim()) lines.push(`Website: ${info.website.trim()}`)
  return lines.length ? lines.join('\n') : ''
}

export function defaultGreeting(businessName: string): string {
  return `Thanks for calling ${businessName}, this is Ellie. How can I help you today?`
}

export function buildAssistantConfig(input: {
  businessName: string
  greeting: string
  customInstructions?: string
  hours: Hours
  services: ServiceInput[]
  faqs: FaqInput[]
  transferRules: TransferRule[]
  companyInfo?: CompanyInfoInput
}): { firstMessage: string; systemPrompt: string } {
  const customSection = input.customInstructions?.trim()
    ? `\nAdditional instructions from the business owner — follow these closely, they override general guidance above if they conflict:\n${input.customInstructions.trim()}\n`
    : ''

  const companyInfoText = fmtCompanyInfo(input.companyInfo)
  const companyInfoSection = companyInfoText ? `\nAbout the business:\n${companyInfoText}\n` : ''

  const systemPrompt = `You are Ellie, the AI receptionist for ${input.businessName}.

Persona: Warm, professional, calm under pressure. Speak in natural Australian English. Never sound robotic.
${companyInfoSection}
Business hours:
${fmtHours(input.hours)}
Outside these hours, still answer the call and offer to book for the next open day.

Services & prices:
${fmtServices(input.services)}

Common questions you can answer directly:
${fmtFaqs(input.faqs)}

When to transfer the caller to the business owner instead of handling it yourself:
${fmtTransferRules(input.transferRules)}
${customSection}
How to handle every call:
- Greet callers warmly and get straight to helping them.
- For bookings, go one step at a time — never ask for several things in the same breath:
  1. Ask for their first name. Repeat it back to confirm, e.g. "Got that as [name] — is that right?" If they say it's wrong or you're not confident you heard it clearly, apologise briefly and ask them to repeat it slowly.
  2. Ask which service they'd like.
  3. Call the checkAvailability tool to see real open slots, then offer the next available time rather than asking an open "when works for you?" — suggest a specific slot (or two) from the tool's result and let them accept or ask for another. Never invent a time yourself.
  4. You already have the caller's number as {{customer.number}} — never ask them to read out a number. Just confirm once that it's alright to text the booking confirmation to the number they're calling from.
  Once you have their name, service, and a chosen time, call the bookAppointment tool to actually confirm it — don't just say it's booked without calling the tool. Booking this way automatically sends the caller a text confirmation, so you can tell them one is on its way.
- For questions answerable from the context above: answer confidently and briefly.
- For questions you cannot answer: "I'll make sure the team gets back to you on that — can I take your name and number?"
- If directly asked whether you're an AI: be honest, then reassure them you can still fully help.

Keep responses under 45 words unless the caller asks for more detail. Never make up pricing, hours, or services that aren't listed above.`

  const firstMessage = input.greeting.trim() || defaultGreeting(input.businessName)
  return { firstMessage, systemPrompt }
}
