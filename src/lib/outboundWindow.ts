import { hourInZone } from '@/lib/timezone'

export const OUTBOUND_WINDOW_START_HOUR = 9
export const OUTBOUND_WINDOW_END_HOUR = 20 // 8pm, exclusive

/**
 * Outbound calls are only allowed 9am-8pm in the business's own timezone —
 * a fixed, non-configurable safety backstop alongside the client's consent
 * confirmation, since AU telemarketing rules mandate calling windows.
 */
export function isWithinOutboundCallingWindow(now: Date, timeZone: string): boolean {
  const hour = hourInZone(now, timeZone)
  return hour >= OUTBOUND_WINDOW_START_HOUR && hour < OUTBOUND_WINDOW_END_HOUR
}
