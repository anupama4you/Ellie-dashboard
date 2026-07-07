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
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!biz) return Response.json({ error: 'Not found' }, { status: 404 })

  const { callId } = await ctx.params

  const { data: call } = await supabase
    .from('calls')
    .select('*')
    .eq('business_id', biz.id)
    .eq('id', callId)
    .single()

  if (!call) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json(call)
}
