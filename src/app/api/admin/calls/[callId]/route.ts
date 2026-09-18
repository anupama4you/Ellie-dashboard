import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/adminAuth'
import { getCampaignLinkForCall, extractToolCalls } from '@/lib/calls'

// Same shape as /api/client/calls/[callId], plus raw_payload (admin-only —
// the client route deliberately excludes it) so tool calls (checkAvailability,
// bookAppointment, etc. — same as Vapi's own dashboard shows) can be pulled
// out server-side via extractToolCalls before responding, rather than
// shipping the whole raw payload to the browser.
const DETAIL_COLUMNS = 'call_type, caller_phone, caller_name, started_at, duration_seconds, status, ended_reason, success_evaluation, summary, recording_url, transcript, vapi_call_id, raw_payload'

export async function GET(
  request: Request,
  ctx: RouteContext<'/api/admin/calls/[callId]'>,
) {
  try {
    await assertAdmin()
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = new URL(request.url).searchParams.get('businessId')
  if (!businessId) return Response.json({ error: 'Missing businessId' }, { status: 400 })

  const { callId } = await ctx.params
  const admin = createAdminClient()

  const { data: call } = await admin
    .from('calls')
    .select(DETAIL_COLUMNS)
    .eq('business_id', businessId)
    .eq('id', callId)
    .single()

  if (!call) return Response.json({ error: 'Not found' }, { status: 404 })

  const campaignLink = await getCampaignLinkForCall(call.vapi_call_id, admin)
  const toolCalls = extractToolCalls(call.raw_payload)

  return Response.json({
    call_type: call.call_type,
    caller_phone: call.caller_phone,
    caller_name: call.caller_name,
    started_at: call.started_at,
    duration_seconds: call.duration_seconds,
    status: call.status,
    ended_reason: call.ended_reason,
    success_evaluation: call.success_evaluation,
    summary: call.summary,
    recording_url: call.recording_url,
    transcript: call.transcript,
    vapi_call_id: call.vapi_call_id,
    campaignLink,
    toolCalls,
  })
}
