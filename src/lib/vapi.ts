const VAPI_BASE = 'https://api.vapi.ai'

export class VapiError extends Error {
  status: number
  /** Human-readable detail from Vapi's error response body, if any */
  detail: string

  constructor(path: string, status: number, detail: string) {
    super(`Vapi ${path} → ${status}${detail ? `: ${detail}` : ''}`)
    this.status = status
    this.detail = detail
  }
}

async function vapiRequest(path: string, options?: RequestInit) {
  // Only GET requests are safe to cache — mutations (PATCH/POST/DELETE) must
  // never be, and this Next.js version's dev-mode fetch instrumentation has
  // been observed to corrupt the response body when `next.revalidate` is
  // applied to a non-GET request.
  const method    = options?.method ?? 'GET'
  const cacheable = method === 'GET' && !options?.cache

  const res = await fetch(`${VAPI_BASE}${path}`, {
    // Short-lived cache so switching tabs a few seconds apart reuses the
    // same response instead of re-hitting Vapi on every navigation.
    ...(cacheable ? { next: { revalidate: 20 } } : { cache: 'no-store' as const }),
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const raw = await res.text()

  if (!res.ok) {
    let detail = ''
    try {
      const body = JSON.parse(raw)
      detail = Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? '')
    } catch {}
    throw new VapiError(path, res.status, detail)
  }

  try {
    return JSON.parse(raw)
  } catch (err) {
    console.error(`Vapi ${path} returned unparsable JSON:`, raw.slice(0, 500))
    throw new Error(`Vapi ${path} returned a response that couldn't be parsed as JSON: ${(err as Error).message}`)
  }
}

export type VapiCall = {
  id: string
  assistantId?: string
  type?: string
  status: string
  startedAt: string
  endedAt?: string
  // Vapi returns "" (not an object) when there's no customer — e.g. web calls
  customer?: { number?: string; name?: string } | string
  // Same deal: "" for web calls, the Vapi/Twilio number for phone calls
  phoneNumber?: { number?: string } | string
  phoneCallProvider?: string
  duration?: number        // v2 field name (seconds)
  durationSeconds?: number // v1 fallback
  cost?: number            // USD
  artifact?: {
    transcript?: string
    recordingUrl?: string
    stereoRecordingUrl?: string
    messages?: unknown[]
  }
  analysis?: {
    summary?: string
    successEvaluation?: string
    structuredData?: unknown
  }
  // Vapi also mirrors this at the top level on some responses
  summary?: string
  endedReason?: string
}

/** Vapi returns "" instead of omitting the field when there's no customer on a call (e.g. web calls) */
export function getCustomer(call: VapiCall): { number?: string; name?: string } {
  return typeof call.customer === 'object' && call.customer ? call.customer : {}
}

/** Same deal for the phone number Ellie answered on — "" or a bare string depending on call type */
export function getAssistantPhoneNumber(call: VapiCall): string | undefined {
  if (typeof call.phoneNumber === 'string') return call.phoneNumber || undefined
  return call.phoneNumber?.number || undefined
}

/**
 * Vapi's AI-generated summary is often blank — analysis can be disabled for the
 * assistant, skipped for trivial calls, or still processing right after a call ends.
 * Falls back to a real quote from the transcript instead of a dead-end placeholder.
 */
export function callSummary(call: VapiCall): { text: string; isReal: boolean } {
  const real = (call.analysis?.summary || call.summary)?.trim()
  if (real) return { text: real, isReal: true }

  const transcript = call.artifact?.transcript
  const firstUserLine = transcript
    ?.split('\n')
    .map(l => l.trim())
    .find(l => /^(user|customer|caller):\s*\S/i.test(l))
  if (firstUserLine) {
    const said = firstUserLine.replace(/^(user|customer|caller):\s*/i, '')
    const excerpt = said.length > 90 ? `${said.slice(0, 90).trimEnd()}…` : said
    return { text: `"${excerpt}"`, isReal: false }
  }

  if (call.endedAt && Date.now() - new Date(call.endedAt).getTime() < 2 * 60 * 1000) {
    return { text: 'Summary is still processing…', isReal: false }
  }

  return { text: 'No transcript captured for this call', isReal: false }
}

/** Returns call duration in whole seconds, handling all Vapi response shapes */
export function callDuration(call: VapiCall): number {
  const raw = call.duration ?? call.durationSeconds
  if (raw != null && raw > 0) {
    // Guard against millisecond values (>7200 would be >2 hours in seconds — treat as ms)
    return raw > 7200 ? Math.round(raw / 1000) : Math.round(raw)
  }
  // Fallback: derive from timestamps
  if (call.startedAt && call.endedAt) {
    const ms = new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()
    return ms > 0 ? Math.round(ms / 1000) : 0
  }
  return 0
}

export async function getCalls(
  assistantId: string,
  limit = 50,
  page = 1,
  dateRange?: { from?: string; to?: string },
): Promise<VapiCall[]> {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), sortOrder: 'DESC' })
  if (assistantId) params.set('assistantId', assistantId)
  if (dateRange?.from) params.set('createdAtGe', `${dateRange.from}T00:00:00.000Z`)
  if (dateRange?.to)   params.set('createdAtLe', `${dateRange.to}T23:59:59.999Z`)
  // v2 endpoint — v1 (/call) rejects the page/sortOrder params with a 400
  const data = await vapiRequest(`/v2/call?${params}`)
  return Array.isArray(data) ? data : (data.results ?? [])
}

export async function getCall(callId: string): Promise<VapiCall> {
  return vapiRequest(`/call/${callId}`)
}

export type VapiAssistant = {
  id: string
  firstMessage?: string
  model?: {
    provider?: string
    model?: string
    messages?: { role: string; content: string }[]
    toolIds?: string[]
    [key: string]: unknown
  }
}

export async function getAssistant(assistantId: string): Promise<VapiAssistant> {
  // Always fresh — this feeds a fetch-then-patch merge, so a stale cached
  // copy risks clobbering recent changes (e.g. tools added moments ago).
  return vapiRequest(`/assistant/${assistantId}`, { cache: 'no-store' })
}

export async function updateAssistant(assistantId: string, patch: Record<string, unknown>): Promise<VapiAssistant> {
  return vapiRequest(`/assistant/${assistantId}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

/** Tool IDs every assistant should have attached — created once via scripts/setup-vapi-tool.mjs */
function requiredToolIds(): string[] {
  return [
    process.env.VAPI_BOOK_APPOINTMENT_TOOL_ID,
    process.env.VAPI_CHECK_AVAILABILITY_TOOL_ID,
  ].filter((id): id is string => !!id)
}

/**
 * Fetch-then-patch so we only ever replace firstMessage, the system message,
 * and our required tools. PATCH isn't guaranteed to deep-merge nested
 * objects, so voice/transcriber/model provider are explicitly preserved
 * rather than risked, and any tool IDs already on the assistant (e.g. added
 * manually in the Vapi dashboard) are kept alongside ours.
 */
export async function syncAssistantPrompt(
  assistantId: string,
  opts: { firstMessage: string; systemPrompt: string },
): Promise<void> {
  const current = await getAssistant(assistantId)
  const toolIds = Array.from(new Set([...(current.model?.toolIds ?? []), ...requiredToolIds()]))
  await updateAssistant(assistantId, {
    firstMessage: opts.firstMessage,
    model: { ...current.model, messages: [{ role: 'system', content: opts.systemPrompt }], toolIds },
  })
}

export type AnalyticsRow = Record<string, string | number | null>

export async function getCallsAnalytics(
  start: string,
  end: string,
  assistantId?: string,
): Promise<{ name: string; result: AnalyticsRow[] }[]> {
  return vapiRequest('/analytics', {
    method: 'POST',
    body: JSON.stringify({
      queries: [
        {
          name: 'daily',
          table: 'call',
          timeRange: { step: 'day', start, end },
          operations: [
            { operation: 'count', column: 'id' },
            { operation: 'sum',   column: 'cost' },
            { operation: 'avg',   column: 'duration' },
          ],
          groupBy: ['date'],
          ...(assistantId ? { assistantId } : {}),
        },
      ],
    }),
  })
}
