import type { Hours } from '@/lib/promptSections'

type ServiceInput = { name: string; durationMinutes: number | null; priceCents: number | null }
type FaqInput = { question: string; answer: string }
type StaffInput = { name: string; active: boolean; hours: Hours | null }

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

/**
 * Only active staff are ever surfaced to Ellie — an inactive/removed staff
 * member shouldn't be offered on calls even though the row still exists for
 * historical appointments. Each staff member's own weekly hours (when they
 * differ from the business's) are spelled out inline so a caller asking
 * "when's Amanda working?" can be answered directly, without that turning
 * into a checkAvailability call.
 */
export function fmtStaff(staff: StaffInput[]): string {
  const active = staff.filter(s => s.active)
  if (active.length === 0) return '(No specific team members listed — treat this as a single-provider business and never ask who the caller wants.)'
  return active.map(s => {
    const schedule = s.hours ? fmtHours(s.hours).split('\n').join('; ') : "Works the business's regular hours above"
    return `- ${s.name} — ${schedule}`
  }).join('\n')
}

export function fmtTransferRules(instructions: string): string {
  return instructions.trim() || '(No transfer instructions — handle every call yourself.)'
}

export function fmtCustomInstructions(instructions: string): string {
  return instructions.trim() || '(No additional instructions from the business owner.)'
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
