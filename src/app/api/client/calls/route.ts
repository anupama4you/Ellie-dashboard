import { createClient } from '@/lib/supabase/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!biz) return Response.json({ error: 'No business found' }, { status: 404 })

  const sp        = new URL(request.url).searchParams
  const page      = Math.max(1, parseInt(sp.get('page')  ?? '1'))
  const limit     = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '25')))
  const ascending = sp.get('sortOrder') === 'ASC'
  const endedReason = sp.get('endedReason')

  let query = supabase
    .from('calls')
    .select('*', { count: 'exact' })
    .eq('business_id', biz.id)
    .order('started_at', { ascending })
    .range((page - 1) * limit, page * limit - 1)

  if (endedReason) query = query.eq('ended_reason', endedReason)

  const { data: calls, count, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ calls: calls ?? [], total: count ?? (calls ?? []).length, page, limit })
}
