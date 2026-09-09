import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSelectedBusinessId } from '@/lib/business'

/**
 * Vapi's call recording storage is now access-controlled — the URL that used
 * to sit in `calls.recording_url` isn't directly downloadable anymore. This
 * proxies the browser's request through Vapi's authenticated endpoint
 * (server-side, using our own private key — never exposed to the client)
 * and 302s to the short-lived signed URL Vapi hands back, same as `curl -L`
 * would. Always requests a fresh one rather than caching, per Vapi's own
 * guidance, since the signed URL expires quickly.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vapiCallId: string }> },
) {
  const { vapiCallId } = await params

  // Deliberately not getCurrentBusiness() — that trusts an x-verified-user-id
  // header set by proxy.ts's middleware, but proxy.ts's matcher excludes
  // /api/* routes (this one included), so that header is never actually set
  // here. A real auth check against Supabase directly is the only correct
  // option on this path.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const businessId = await getSelectedBusinessId(supabase, user.id)
  if (!businessId) return new NextResponse('Unauthorized', { status: 401 })

  // Only let a signed-in business fetch a recording that actually belongs to
  // one of their own calls — the vapi_call_id alone shouldn't be enough.
  const { data: call } = await supabase
    .from('calls')
    .select('id')
    .eq('business_id', businessId)
    .eq('vapi_call_id', vapiCallId)
    .single()
  if (!call) return new NextResponse('Not found', { status: 404 })

  const key = process.env.VAPI_PRIVATE_KEY
  if (!key) return new NextResponse('Vapi is not configured', { status: 500 })

  const vapiRes = await fetch(`https://api.vapi.ai/call/${vapiCallId}/mono-recording`, {
    headers: { Authorization: `Bearer ${key}` },
    redirect: 'manual',
    cache: 'no-store',
  })

  const location = vapiRes.headers.get('location')
  if ([301, 302, 303, 307, 308].includes(vapiRes.status) && location) {
    return NextResponse.redirect(location)
  }

  const detail = await vapiRes.text().catch(() => '')
  console.error(`Vapi recording fetch failed for call ${vapiCallId}: ${vapiRes.status} ${detail}`)
  return new NextResponse('Could not load recording', { status: vapiRes.status >= 400 ? vapiRes.status : 502 })
}
