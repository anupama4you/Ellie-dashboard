import { isFeatureEnabled, type DashboardFeatures } from '@/lib/dashboardFeatures'
import { getAssistant } from '@/lib/vapi'

export type CalendarHealth = 'connected' | 'expired' | 'error' | 'not_connected'

/** Pure, local-data-only — safe to compute for every row on the clients list. */
export function calendarHealthFromRow(
  row: { status: string; token_expiry: string } | null | undefined,
): CalendarHealth {
  if (!row) return 'not_connected'
  if (row.status === 'error') return 'error'
  if (row.status !== 'connected') return 'not_connected'
  return new Date(row.token_expiry) < new Date() ? 'expired' : 'connected'
}

/**
 * Flags only real footguns, not every business that hasn't opted into a
 * feature — a business with `appointments` on but no calendar connected at
 * all is a completely normal, valid setup (local-only availability), so
 * that alone is never a flag. Only a connection that exists but is broken
 * is unambiguously a problem worth surfacing.
 */
export function hasVisibleHealthIssue(
  biz: { twilio_phone_number: string | null; dashboard_features?: DashboardFeatures | null },
  calendarHealth: CalendarHealth,
): boolean {
  const smsEnabledNoTwilio    = isFeatureEnabled(biz, 'sms') && !biz.twilio_phone_number
  const appointmentsCalBroken = isFeatureEnabled(biz, 'appointments') && (calendarHealth === 'error' || calendarHealth === 'expired')
  return smsEnabledNoTwilio || appointmentsCalBroken
}

export type VapiHealth = 'no_assistant' | 'no_server_url' | 'ok' | 'error'

/** One live Vapi API call — only ever call this for a single client (the Health tab), never in a list loop. */
export async function getLiveVapiHealth(assistantId: string | null): Promise<VapiHealth> {
  if (!assistantId) return 'no_assistant'
  try {
    const assistant = await getAssistant(assistantId)
    return assistant.server?.url ? 'ok' : 'no_server_url'
  } catch {
    return 'error'
  }
}
