import { createClient } from '@/lib/supabase/server'
import { zonedTimeToUtc } from '@/lib/timezone'

export type LocalCall = {
  id: string
  business_id: string
  vapi_call_id: string
  vapi_assistant_id: string | null
  call_type: string | null
  status: string | null
  caller_name: string | null
  caller_phone: string | null
  assistant_phone: string | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  ended_reason: string | null
  outcome: string | null
  summary: string | null
  success_evaluation: string | null
  transcript: string | null
  recording_url: string | null
  raw_payload: unknown
  created_at: string
  updated_at: string
}

export async function getLocalCalls(
  businessId: string,
  opts: { limit?: number; dateRange?: { from?: string; to?: string; timeZone?: string } } = {},
): Promise<LocalCall[]> {
  const supabase = await createClient()
  let query = supabase
    .from('calls')
    .select('*')
    .eq('business_id', businessId)
    .order('started_at', { ascending: false })
    .limit(opts.limit ?? 300)

  // `from`/`to` are calendar dates (YYYY-MM-DD) the business means in its own
  // timezone — treating them as UTC midnight (as this used to) shifts the
  // whole range by the business's UTC offset, clipping off early-morning or
  // late-night calls near the boundary.
  const timeZone = opts.dateRange?.timeZone ?? 'Australia/Adelaide'
  if (opts.dateRange?.from) {
    const [y, mo, d] = opts.dateRange.from.split('-').map(Number)
    query = query.gte('started_at', zonedTimeToUtc(timeZone, y, mo, d, 0, 0).toISOString())
  }
  if (opts.dateRange?.to) {
    const [y, mo, d] = opts.dateRange.to.split('-').map(Number)
    const endOfDay = new Date(zonedTimeToUtc(timeZone, y, mo, d, 0, 0).getTime() + 24 * 60 * 60_000 - 1)
    query = query.lte('started_at', endOfDay.toISOString())
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getLocalCall(businessId: string, id: string): Promise<LocalCall | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('calls')
    .select('*')
    .eq('business_id', businessId)
    .eq('id', id)
    .single()
  return data ?? null
}

/**
 * The AI-generated summary can be blank — analysis is sometimes disabled,
 * skipped for trivial calls, or still processing right after a call ends.
 * Falls back to a real quote from the transcript instead of a dead-end
 * placeholder.
 */
export function callSummary(call: LocalCall): { text: string; isReal: boolean } {
  const real = call.summary?.trim()
  if (real) return { text: real, isReal: true }

  const firstUserLine = call.transcript
    ?.split('\n')
    .map(l => l.trim())
    .find(l => /^(user|customer|caller):\s*\S/i.test(l))
  if (firstUserLine) {
    const said = firstUserLine.replace(/^(user|customer|caller):\s*/i, '')
    const excerpt = said.length > 90 ? `${said.slice(0, 90).trimEnd()}…` : said
    return { text: `"${excerpt}"`, isReal: false }
  }

  if (call.ended_at && Date.now() - new Date(call.ended_at).getTime() < 2 * 60 * 1000) {
    return { text: 'Summary is still processing…', isReal: false }
  }

  return { text: 'No transcript captured for this call', isReal: false }
}
