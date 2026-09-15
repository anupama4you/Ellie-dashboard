import { sendEmail } from '@/lib/resend'

export type NotificationKey = 'campaignStopped' | 'campaignCompleted' | 'appointmentActivity' | 'missedCall' | 'bookingLinkSent' | 'callbackRequested'

export type NotificationPreferences = Partial<Record<NotificationKey, boolean>>

/** Which channel(s) a notification type actually goes out on — every type emails
 *  today, and 'callbackRequested' additionally texts the business's own phone
 *  (see requestCallback in the vapi webhook). One toggle still controls both
 *  channels for a given type; this is purely so the UI can say so accurately. */
export type NotificationChannel = 'email' | 'sms'

export const NOTIFICATION_REGISTRY: { key: NotificationKey; label: string; description: string; channels: NotificationChannel[] }[] = [
  { key: 'campaignStopped',      label: 'Campaign stopped',       description: "An outbound campaign hit a problem and paused — nothing else in it will be called until you resume it.", channels: ['email'] },
  { key: 'campaignCompleted',    label: 'Campaign completed',     description: 'Every contact in an outbound campaign has been called, with a summary of how it went.', channels: ['email'] },
  { key: 'appointmentActivity',  label: 'Appointment activity',   description: 'Ellie booked, rescheduled, or cancelled an appointment on a call.', channels: ['email'] },
  { key: 'missedCall',           label: 'Missed or unresolved call', description: "A call ended without a booking and wasn't transferred to a person — may need a follow-up.", channels: ['email'] },
  { key: 'bookingLinkSent',      label: 'Booking link sent',      description: 'Ellie texted a caller a link to book online instead of taking the booking on the call.', channels: ['email'] },
  { key: 'callbackRequested',    label: 'Callback requested',     description: 'A caller asked to speak with your team instead of continuing with Ellie.', channels: ['email', 'sms'] },
]

/**
 * Same "absent/true = enabled, explicit false disables it" convention as
 * dashboardFeatures.ts's isFeatureEnabled — every existing business keeps
 * getting these emails unchanged on rollout (campaignStopped already sent
 * unconditionally before this existed), and a client opts OUT per type
 * rather than having to opt in to anything.
 */
export function isNotificationEnabled(
  business: { notification_preferences?: NotificationPreferences | null } | null | undefined,
  key: NotificationKey,
): boolean {
  return business?.notification_preferences?.[key] !== false
}

/**
 * Sends a notification email if, and only if, the business hasn't turned
 * that type off. Every call site already has the business row and its own
 * way of resolving "the client's account email" (a live session's
 * getCurrentBusiness() vs. the webhook's admin.auth.admin.getUserById), so
 * that's passed in as a thunk rather than resolved here — this stays a
 * pure "check the toggle, send or don't" gate.
 */
export async function sendNotificationEmail(
  business: { notification_preferences?: NotificationPreferences | null } | null | undefined,
  key: NotificationKey,
  getEmail: () => Promise<string | null>,
  subject: string,
  html: string,
): Promise<void> {
  if (!isNotificationEnabled(business, key)) return
  try {
    const email = await getEmail()
    if (email) await sendEmail(email, subject, html)
  } catch (err) {
    console.error(`Failed to send "${key}" notification email:`, err)
  }
}
