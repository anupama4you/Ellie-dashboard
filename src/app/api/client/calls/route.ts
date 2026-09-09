import { createClient } from '@/lib/supabase/server'
import { getSelectedBusinessId } from '@/lib/business'
import { captureError } from '@/lib/monitoring'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const businessId = await getSelectedBusinessId(supabase, user.id)
  if (!businessId) return Response.json({ error: 'No business found' }, { status: 404 })

  const sp        = new URL(request.url).searchParams
  const page      = Math.max(1, parseInt(sp.get('page')  ?? '1'))
  const limit     = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '25')))
  const ascending = sp.get('sortOrder') === 'ASC'
  const endedReason = sp.get('endedReason')

  let query = supabase
    .from('calls')
    .select('*', { count: 'exact' })
    .eq('business_id', businessId)
    .order('started_at', { ascending })
    .range((page - 1) * limit, page * limit - 1)

  if (endedReason) query = query.eq('ended_reason', endedReason)

  const { data: calls, count, error } = await query
  if (error) {
    captureError(error, { handler: 'api/client/calls' })
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  return Response.json({ calls: calls ?? [], total: count ?? (calls ?? []).length, page, limit })
}
