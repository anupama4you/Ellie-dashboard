import { createClient } from '@/lib/supabase/server'

// Only what CallDetailPane's toDetailData() actually reads — not raw_payload
// (a jsonb blob it never touches) or the other bookkeeping columns.
const DETAIL_COLUMNS = 'call_type, caller_phone, caller_name, started_at, duration_seconds, status, ended_reason, success_evaluation, summary, recording_url, transcript, vapi_call_id'

export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/client/calls/[callId]'>,
) {
  const supabase = await createClient()
  // getSession() reads the signed session cookie locally instead of
  // round-tripping to Supabase's Auth server on every single call click —
  // this route only ever reads data scoped to the cookie's own business_id,
  // so a session that's been revoked but not yet expired locally can't reach
  // anyone else's data anyway.
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!biz) return Response.json({ error: 'Not found' }, { status: 404 })

  const { callId } = await ctx.params

  const { data: call } = await supabase
    .from('calls')
    .select(DETAIL_COLUMNS)
    .eq('business_id', biz.id)
    .eq('id', callId)
    .single()

  if (!call) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json(call)
}
