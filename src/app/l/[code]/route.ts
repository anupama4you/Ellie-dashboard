import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Public redirect for self-hosted short links (see src/lib/shortLinks.ts) —
 * clicked from an SMS by an anonymous customer, so this deliberately uses
 * the service-role client rather than requiring a session. Not cached
 * (`no-store`) since a code's target could change if ever repointed.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const admin = createAdminClient()
  const { data } = await admin.from('short_links').select('target_url').eq('code', code).maybeSingle()

  if (!data?.target_url) return new NextResponse('Not found', { status: 404 })

  return NextResponse.redirect(data.target_url, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}
