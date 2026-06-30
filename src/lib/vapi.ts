const VAPI_BASE = 'https://api.vapi.ai'

async function vapiRequest(path: string, options?: RequestInit) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) throw new Error(`Vapi ${path} → ${res.status}`)
  return res.json()
}

export type VapiCall = {
  id: string
  assistantId?: string
  type?: string
  status: string
  startedAt: string
  endedAt?: string
  customer?: { number?: string; name?: string }
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
  endedReason?: string
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
  const data = await vapiRequest(`/call?${params}`)
  return Array.isArray(data) ? data : (data.results ?? [])
}

export async function getCall(callId: string): Promise<VapiCall> {
  return vapiRequest(`/call/${callId}`)
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
