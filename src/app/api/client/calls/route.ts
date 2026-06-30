import { createClient } from '@/lib/supabase/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('vapi_assistant_id')
    .eq('user_id', user.id)
    .single()

  if (!biz?.vapi_assistant_id)
    return Response.json({ error: 'No assistant configured' }, { status: 404 })

  const sp        = new URL(request.url).searchParams
  const page      = Math.max(1, parseInt(sp.get('page')  ?? '1'))
  const limit     = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '25')))
  const sortOrder = sp.get('sortOrder') === 'ASC' ? 'ASC' : 'DESC'
  const endedReason = sp.get('endedReason')

  const params = new URLSearchParams({
    page: String(page), limit: String(limit), sortOrder,
    assistantId: biz.vapi_assistant_id,
  })
  if (endedReason) params.set('endedReason', endedReason)

  const res = await fetch(`https://api.vapi.ai/v2/call?${params}`, {
    headers: { Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
    cache: 'no-store',
  })

  if (!res.ok) return Response.json({ error: `Vapi ${res.status}` }, { status: res.status })

  const data  = await res.json()
  const calls = Array.isArray(data) ? data : (data.results ?? [])
  return Response.json({ calls, total: data.total ?? calls.length, page, limit })
}
