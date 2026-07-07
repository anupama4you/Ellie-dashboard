export type CallCategory = 'booked' | 'enquiry' | 'transferred' | 'missed' | 'errored'

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

/** Single source of truth for turning a Vapi `endedReason` into the category we store as `calls.outcome` and display everywhere. */
export function classifyCall(endedReason?: string): { category: CallCategory; label: string; color: string; bg: string } {
  if (endedReason === 'appointment-scheduled') {
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
  return { category: 'enquiry', label: 'Enquiry', color: 'var(--violet)', bg: 'var(--violet-soft)' }
}

export function callTypeLabel(type?: string) {
  if (type === 'webCall') return 'Web'
  if (type === 'outboundPhoneCall') return 'Outbound'
  if (type === 'inboundPhoneCall') return 'Inbound'
  return 'Phone'
}
