export type CallCategory = 'booked' | 'rebooked' | 'linked' | 'reviewRequested' | 'declined' | 'enquiry' | 'transferred' | 'missed' | 'errored'

const ERROR_REASONS = new Set([
  'exceeded-max-duration',
  'max-duration-exceeded',
  'silence-timed-out',
  'error-assistant-did-not-receive-customer-audio',
  'assistant-did-not-receive-customer-audio',
  'error-assistant-not-invalid-tool-call-payload',
  'twilio-failed-to-connect-call',
  'twilio-reported-customer-misdialed',
  'sip-telephony-provider-closed-call',
  'vonage-rejected',
  'assistant-error',
  'pipeline-error',
  'custom-function-error',
  'worker-shutdown',
  'unknown-error',
])

/**
 * Single source of truth for turning a Vapi `endedReason` (plus whether a
 * booking/reschedule actually happened during the call) into the category we
 * store as `calls.outcome` and display everywhere. `endedReason` alone can't
 * detect either — `appointment-scheduled` is a Vapi-native flow value that's
 * never emitted for our own custom `bookAppointment`/`rescheduleAppointment`
 * tool calls, so `hasBooking`/`hasReschedule` are the real signals.
 * `hasReschedule` takes priority over `hasBooking` (more specific/informative).
 *
 * `hasBookingLink` covers clients (e.g. those booking through an external
 * platform like GetTimely) whose assistant never calls `bookAppointment` at
 * all — there's no `appointments` row to correlate, so the only signal that
 * the call went somewhere useful is the `sendSms`-booking-link flag from the
 * assistant's structured-data analysis. It ranks below every ended-reason
 * outcome (transferred/missed/errored are more specific about how the call
 * actually ended) but above the generic 'enquiry' fallback. Displayed as
 * "Booking requested" (category stays 'linked' in the DB) and counted
 * alongside 'booked'/'rebooked' in every booking-conversion metric — see
 * `src/app/(dashboard)/page.tsx` and `AnalyticsCharts.tsx` — since sending
 * the link is the full extent of what Ellie can do for these businesses.
 *
 * `hasDeclined` exists only for outbound campaign calls (a caller who
 * answered, was asked something — feedback, a re-booking offer, a
 * promotion — and said no) — the webhook only passes it true when it has
 * a campaign contact to correlate against, so an ordinary inbound call can
 * never be classified 'declined'. Without it, a declined offer and a real
 * inbound question about something else were indistinguishable — both
 * just fell through to 'enquiry', which reads as "customer asked
 * something" rather than "customer said no." Ranked below every positive
 * signal but above the generic 'enquiry' catch-all, same priority tier as
 * 'linked'.
 *
 * `hasReviewRequested` is the same ground-truth-only pattern as
 * `hasBookingLink`, just for a Google-review link instead of a booking
 * link (the sendSms tool's `linkType: "review"` argument — see the
 * `groundTruthColumn` branch in the vapi webhook) — no analysis-plan
 * fallback, since it's new enough that no business's structuredDataPlan
 * judges it yet. Without this, a call where Ellie successfully texted a
 * review link had no way to be distinguished from a plain 'enquiry' —
 * which is literally what happened on a real call. Ranked just below
 * `hasBookingLink` (a booking signal is more specific/valuable) and above
 * `hasDeclined` (a call that got as far as a review request was clearly
 * not declined).
 */
export function classifyCall(endedReason?: string, hasBooking?: boolean, hasReschedule?: boolean, hasBookingLink?: boolean, hasDeclined?: boolean, hasReviewRequested?: boolean): { category: CallCategory; label: string; color: string; bg: string } {
  if (hasReschedule) {
    return { category: 'rebooked', label: 'Rebooked', color: 'var(--violet)', bg: 'var(--violet-soft)' }
  }
  if (hasBooking || endedReason === 'appointment-scheduled') {
    return { category: 'booked', label: 'Booked', color: 'var(--signal)', bg: 'var(--signal-soft)' }
  }
  if (endedReason === 'call-transferred') {
    return { category: 'transferred', label: 'Transferred', color: 'var(--amber)', bg: 'var(--amber-soft)' }
  }
  if (endedReason === 'customer-did-not-answer') {
    return { category: 'missed', label: 'No answer', color: 'var(--coral)', bg: 'var(--coral-soft)' }
  }
  if (endedReason === 'voicemail') {
    return { category: 'missed', label: 'Voicemail', color: 'var(--coral)', bg: 'var(--coral-soft)' }
  }
  if (endedReason === 'customer-busy') {
    return { category: 'missed', label: 'Busy', color: 'var(--coral)', bg: 'var(--coral-soft)' }
  }
  if (endedReason && (ERROR_REASONS.has(endedReason) || endedReason.toLowerCase().includes('error'))) {
    return { category: 'errored', label: 'Error', color: 'var(--coral)', bg: 'var(--coral-soft)' }
  }
  if (hasBookingLink) {
    return { category: 'linked', label: 'Booking requested', color: 'var(--signal)', bg: 'var(--signal-soft)' }
  }
  if (hasReviewRequested) {
    return { category: 'reviewRequested', label: 'Review requested', color: 'var(--signal)', bg: 'var(--signal-soft)' }
  }
  if (hasDeclined) {
    return { category: 'declined', label: 'Declined', color: 'var(--ink-3)', bg: 'var(--paper)' }
  }
  return { category: 'enquiry', label: 'Enquiry', color: 'var(--violet)', bg: 'var(--violet-soft)' }
}

const CATEGORY_STYLES: Record<CallCategory, { label: string; color: string; bg: string }> = {
  booked:      { label: 'Booked',            color: 'var(--signal)', bg: 'var(--signal-soft)' },
  rebooked:    { label: 'Rebooked',          color: 'var(--violet)', bg: 'var(--violet-soft)' },
  linked:      { label: 'Booking requested', color: 'var(--signal)', bg: 'var(--signal-soft)' },
  reviewRequested: { label: 'Review requested', color: 'var(--signal)', bg: 'var(--signal-soft)' },
  declined:    { label: 'Declined',          color: 'var(--ink-3)',  bg: 'var(--paper)' },
  enquiry:     { label: 'Enquiry',           color: 'var(--violet)', bg: 'var(--violet-soft)' },
  transferred: { label: 'Transferred',       color: 'var(--amber)',  bg: 'var(--amber-soft)' },
  missed:      { label: 'No answer',         color: 'var(--coral)',  bg: 'var(--coral-soft)' },
  errored:     { label: 'Error',             color: 'var(--coral)',  bg: 'var(--coral-soft)' },
}

/**
 * Same label/color mapping classifyCall() produces, for a place that only
 * has the already-resolved category string (e.g. outbound_campaign_contacts
 * .outcome, stored as classifyCall(...).category) and not the raw
 * endedReason/hasBooking signals needed to re-derive it.
 */
export function categoryStyle(category: string): { label: string; color: string; bg: string } {
  return CATEGORY_STYLES[category as CallCategory] ?? { label: category, color: 'var(--ink-3)', bg: 'var(--paper)' }
}

export function callTypeLabel(type?: string) {
  if (type === 'webCall') return 'Web'
  if (type === 'outboundPhoneCall') return 'Outbound'
  if (type === 'inboundPhoneCall') return 'Inbound'
  return 'Phone'
}
