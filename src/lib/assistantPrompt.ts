import type { Hours, TransferRule } from '@/app/(dashboard)/briefing/actions'

type ServiceInput = { name: string; durationMinutes: number | null; priceCents: number | null }
type FaqInput = { question: string; answer: string }

const DAY_LABEL: Record<keyof Hours, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}
const DAY_ORDER: (keyof Hours)[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function fmtHours(hours: Hours): string {
  return DAY_ORDER.map(day => {
    const d = hours[day]
    const label = DAY_LABEL[day]
    return d.open ? `${label}: ${d.opensAt} – ${d.closesAt}` : `${label}: Closed`
  }).join('\n')
}

export function fmtServices(services: ServiceInput[]): string {
  if (services.length === 0) return '(No services configured yet.)'
  return services.map(s => {
    const duration = s.durationMinutes ? ` (${s.durationMinutes} min)` : ''
    const price = s.priceCents != null ? ` — $${(s.priceCents / 100).toFixed(2)}` : ''
    return `- ${s.name}${duration}${price}`
  }).join('\n')
}

export function fmtFaqs(faqs: FaqInput[]): string {
  if (faqs.length === 0) return '(No common questions configured yet.)'
  return faqs.map(f => `- Q: ${f.question}\n  A: ${f.answer}`).join('\n')
}

export function fmtTransferRules(rules: TransferRule[]): string {
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

export function fmtDescription(info?: CompanyInfoInput): string {
  return info?.description?.trim() || '(No description provided yet.)'
}

export function fmtLocation(info?: CompanyInfoInput): string {
  const location = [info?.address, info?.city, info?.state, info?.postcode].filter(Boolean).join(', ')
  return location || '(No address provided yet.)'
}

export function fmtWebsite(info?: CompanyInfoInput): string {
  return info?.website?.trim() || '(No website provided yet.)'
}

export function defaultGreeting(businessName: string): string {
  return `Thanks for calling ${businessName}, this is Ellie. How can I help you today?`
}

/**
 * Data sections a hand-authored prompt can opt into surgical, marker-scoped
 * updates for (see patchPromptSections below), instead of a full rewrite.
 * Company info is split into three independent markers (rather than one
 * appended blob) so each can be placed and phrased wherever it makes sense
 * in a given prompt — e.g. description as its own paragraph, location inline
 * after a "Location:" label the admin writes themselves.
 */
export type BriefingSectionKey = 'description' | 'location' | 'website' | 'hours' | 'services' | 'faqs' | 'transferRules'

const SECTION_KEYS: BriefingSectionKey[] = ['description', 'location', 'website', 'hours', 'services', 'faqs', 'transferRules']

/** Sections meant to sit inline within hand-written text (e.g. after a "Location:" label) — patched without surrounding newlines. Everything else is a standalone block. */
const INLINE_SECTIONS = new Set<BriefingSectionKey>(['location', 'website'])

export function sectionMarkers(key: BriefingSectionKey): { open: string; close: string } {
  return { open: `<!-- briefing:${key} -->`, close: `<!-- /briefing:${key} -->` }
}

export type BriefingSectionData = {
  hours: Hours
  services: ServiceInput[]
  faqs: FaqInput[]
  transferRules: TransferRule[]
  companyInfo?: CompanyInfoInput
}

function sectionContent(key: BriefingSectionKey, data: BriefingSectionData): string {
  switch (key) {
    case 'description':    return fmtDescription(data.companyInfo)
    case 'location':        return fmtLocation(data.companyInfo)
    case 'website':          return fmtWebsite(data.companyInfo)
    case 'hours':             return fmtHours(data.hours)
    case 'services':          return fmtServices(data.services)
    case 'faqs':               return fmtFaqs(data.faqs)
    case 'transferRules':     return fmtTransferRules(data.transferRules)
  }
}

/**
 * Surgically replaces only the text between matching `<!-- briefing:key -->`
 * / `<!-- /briefing:key -->` markers with freshly formatted data — everything
 * else in a hand-authored prompt is left byte-for-byte untouched. Sections
 * with no markers present are reported as missing rather than guessed at, so
 * a prompt that hasn't been marked up yet is never silently rewritten.
 */
export function patchPromptSections(
  promptText: string,
  data: BriefingSectionData,
): { patched: string; appliedSections: BriefingSectionKey[]; missingSections: BriefingSectionKey[] } {
  let patched = promptText
  const appliedSections: BriefingSectionKey[] = []
  const missingSections: BriefingSectionKey[] = []

  for (const key of SECTION_KEYS) {
    const { open, close } = sectionMarkers(key)
    const openIdx = patched.indexOf(open)
    const closeIdx = patched.indexOf(close)
    if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) {
      missingSections.push(key)
      continue
    }
    const before = patched.slice(0, openIdx + open.length)
    const after = patched.slice(closeIdx)
    const content = sectionContent(key, data)
    patched = INLINE_SECTIONS.has(key) ? `${before}${content}${after}` : `${before}\n${content}\n${after}`
    appliedSections.push(key)
  }

  return { patched, appliedSections, missingSections }
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

  const m = {
    description: sectionMarkers('description'),
    location: sectionMarkers('location'),
    website: sectionMarkers('website'),
    hours: sectionMarkers('hours'),
    services: sectionMarkers('services'),
    faqs: sectionMarkers('faqs'),
    transferRules: sectionMarkers('transferRules'),
  }

  const systemPrompt = `You are Ellie, the AI receptionist for ${input.businessName}.

Persona: Warm, professional, calm under pressure. Speak in natural Australian English. Never sound robotic.

About the business:
${m.description.open}
${fmtDescription(input.companyInfo)}
${m.description.close}
Location: ${m.location.open}${fmtLocation(input.companyInfo)}${m.location.close}
Website: ${m.website.open}${fmtWebsite(input.companyInfo)}${m.website.close}

Business hours:
${m.hours.open}
${fmtHours(input.hours)}
${m.hours.close}
Outside these hours, still answer the call and offer to book for the next open day.

Services & prices:
${m.services.open}
${fmtServices(input.services)}
${m.services.close}

Common questions you can answer directly:
${m.faqs.open}
${fmtFaqs(input.faqs)}
${m.faqs.close}

When to transfer the caller to the business owner instead of handling it yourself:
${m.transferRules.open}
${fmtTransferRules(input.transferRules)}
${m.transferRules.close}
${customSection}
How to handle every call:
- Greet callers warmly and get straight to helping them.
- For bookings, go one step at a time — never ask for several things in the same breath:
  1. Ask for their first name. Repeat it back to confirm, e.g. "Got that as [name] — is that right?" If they say it's wrong or you're not confident you heard it clearly, apologise briefly and ask them to repeat it slowly.
  2. Ask which service they'd like. If they mention any specific detail about what they want (a particular design, a preference, an allergy or sensitivity, anything special) note it naturally in conversation — don't interrogate them for it, just capture whatever they volunteer.
  3. Call the checkAvailability tool to see real open slots, then offer the next available time rather than asking an open "when works for you?" — suggest a specific slot (or two) from the tool's result and let them accept or ask for another. Never invent a time yourself.
  4. You already have the caller's number as {{customer.number}} — never ask them to read out a number. Just confirm once that it's alright to text the booking confirmation to the number they're calling from.
  Once you have their name, service, and a chosen time, call the bookAppointment tool to actually confirm it — don't just say it's booked without calling the tool. If they mentioned any specific detail in step 2, pass it in the tool's optional notes field, in your own words, briefly. Booking this way automatically sends the caller a text confirmation, so you can tell them one is on its way.
- For questions answerable from the context above: answer confidently and briefly.
- For questions you cannot answer: "I'll make sure the team gets back to you on that — can I take your name and number?"
- If directly asked whether you're an AI: be honest, then reassure them you can still fully help.

Keep responses under 45 words unless the caller asks for more detail. Never make up pricing, hours, or services that aren't listed above.`

  const firstMessage = input.greeting.trim() || defaultGreeting(input.businessName)
  return { firstMessage, systemPrompt }
}
