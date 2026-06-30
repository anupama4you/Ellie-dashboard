import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/client/calls/[callId]'>,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('vapi_assistant_id')
    .eq('user_id', user.id)
    .single()

  if (!biz?.vapi_assistant_id)
    return Response.json({ error: 'Not found' }, { status: 404 })

  const { callId } = await ctx.params

  const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
    cache: 'no-store',
  })

  if (!res.ok) return Response.json({ error: 'Not found' }, { status: 404 })

  const call = await res.json()

  // SECURITY: verify call belongs to this user's assistant — never trust the client
  if (call.assistantId !== biz.vapi_assistant_id)
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  return Response.json(call)
}
