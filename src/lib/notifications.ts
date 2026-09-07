import { sendEmail } from '@/lib/resend'

export type NotificationKey = 'campaignStopped' | 'campaignCompleted' | 'appointmentActivity' | 'missedCall'

export type NotificationPreferences = Partial<Record<NotificationKey, boolean>>

export const NOTIFICATION_REGISTRY: { key: NotificationKey; label: string; description: string }[] = [
  { key: 'campaignStopped',      label: 'Campaign stopped',       description: "An outbound campaign hit a problem and paused — nothing else in it will be called until you resume it." },
  { key: 'campaignCompleted',    label: 'Campaign completed',     description: 'Every contact in an outbound campaign has been called, with a summary of how it went.' },
  { key: 'appointmentActivity',  label: 'Appointment activity',   description: 'Ellie booked, rescheduled, or cancelled an appointment on a call.' },
  { key: 'missedCall',           label: 'Missed or unresolved call', description: "A call ended without a booking and wasn't transferred to a person — may need a follow-up." },
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
