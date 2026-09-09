/**
 * Single source of truth for every customer-facing booking SMS — used by
 * both the Vapi webhook (AI-booked calls) and the dashboard's manual
 * create/reschedule/cancel actions, so the wording can never drift between
 * the two paths. Also rendered read-only in Settings so clients can see
 * exactly what their customers receive.
 *
 * Admin-editable per business (`businesses.sms_template_*` columns, see
 * migration 20260909040000) via {{placeholder}} substitution — a NULL
 * column means "use the built-in default" below. Clients can see but never
 * edit these; only the admin panel writes to those columns.
 */

const DEFAULT_BOOKING_TEMPLATE = `Hi {{customerName}} 👋

Your {{service}} with {{businessName}} is confirmed for:
📅 {{dateTime}}
⏱️ {{duration}} minutes
{{mapsLink}}
See you then! ✅`

const DEFAULT_RESCHEDULE_TEMPLATE = `Hi {{customerName}} 👋

Your {{service}} with {{businessName}} has been moved to:
📅 {{dateTime}}
⏱️ {{duration}} minutes
{{mapsLink}}
See you then! ✅`

const DEFAULT_CANCELLATION_TEMPLATE = `Hi {{customerName}} 👋

Your {{service}} with {{businessName}} on {{dateTime}} has been cancelled.

Let us know if you'd like to rebook.`

/** Every placeholder a template may reference; substitution is unconditional — an unused or unrecognised {{token}} just becomes ''. */
type SmsPlaceholderValues = Record<string, string | undefined>

function renderTemplate(template: string, values: SmsPlaceholderValues): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? '')
}

export type BookingSmsParams = {
  customerName: string | null | undefined
  service: string | null | undefined
  businessName: string
  dateTimeLabel: string
  durationMinutes: number | string
  mapsLink?: string | null
}

/** `mapsLink` is the bare URL — folded into one placeholder value (with its own emoji/spacing) so a template with no configured address collapses to a clean blank line instead of a dangling "📍 " fragment. */
function bookingPlaceholders(p: BookingSmsParams): SmsPlaceholderValues {
  return {
    customerName: p.customerName ?? '',
    service: p.service ?? 'appointment',
    businessName: p.businessName,
    dateTime: p.dateTimeLabel,
    duration: String(p.durationMinutes),
    mapsLink: p.mapsLink ? `📍 ${p.mapsLink}` : '',
  }
}

export function bookingConfirmationSms(p: BookingSmsParams, customTemplate?: string | null): string {
  return renderTemplate(customTemplate?.trim() || DEFAULT_BOOKING_TEMPLATE, bookingPlaceholders(p))
}

export function rescheduleConfirmationSms(p: BookingSmsParams, customTemplate?: string | null): string {
  return renderTemplate(customTemplate?.trim() || DEFAULT_RESCHEDULE_TEMPLATE, bookingPlaceholders(p))
}

export type CancellationSmsParams = {
  customerName: string | null | undefined
  service: string | null | undefined
  businessName: string
  dateTimeLabel: string
}

export function cancellationConfirmationSms(p: CancellationSmsParams, customTemplate?: string | null): string {
  const values: SmsPlaceholderValues = {
    customerName: p.customerName ?? '',
    service: p.service ?? 'appointment',
    businessName: p.businessName,
    dateTime: p.dateTimeLabel,
  }
  return renderTemplate(customTemplate?.trim() || DEFAULT_CANCELLATION_TEMPLATE, values)
}

/** Raw default templates, for the admin panel's textarea placeholder text and "reset to default" behaviour — never mutated. */
export const SMS_TEMPLATE_DEFAULTS = {
  booking: DEFAULT_BOOKING_TEMPLATE,
  reschedule: DEFAULT_RESCHEDULE_TEMPLATE,
  cancellation: DEFAULT_CANCELLATION_TEMPLATE,
} as const

/**
 * Placeholder-filled previews for read-only display in Settings — shows
 * whatever's actually configured for this business (custom if set, else the
 * default), so the client sees literally what their customers will receive.
 */
export function getSmsTemplatePreviews(
  businessName: string,
  custom?: { booking?: string | null; reschedule?: string | null; cancellation?: string | null },
): { label: string; body: string }[] {
  const shared: BookingSmsParams = {
    customerName: '[Customer Name]',
    service: '[Service]',
    businessName,
    dateTimeLabel: '[Date & Time]',
    durationMinutes: '[Duration]',
    mapsLink: '[Location Link]',
  }
  return [
    { label: 'Booking confirmation', body: bookingConfirmationSms(shared, custom?.booking) },
    { label: 'Reschedule confirmation', body: rescheduleConfirmationSms(shared, custom?.reschedule) },
    { label: 'Cancellation confirmation', body: cancellationConfirmationSms({ ...shared }, custom?.cancellation) },
  ]
}
