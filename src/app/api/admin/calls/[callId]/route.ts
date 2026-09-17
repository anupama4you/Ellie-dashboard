import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/adminAuth'
import { getCampaignLinkForCall } from '@/lib/calls'

// Same shape as /api/client/calls/[callId] — CallDetailPane's toDetailData()
// reads either response identically, it just points at a different URL
// depending on whether it's rendered inside the client dashboard or the
// admin panel (see CallsExplorer's `detailFetchUrl` prop).
const DETAIL_COLUMNS = 'call_type, caller_phone, caller_name, started_at, duration_seconds, status, ended_reason, success_evaluation, summary, recording_url, transcript, vapi_call_id'

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

  return Response.json({ ...call, campaignLink })
}
