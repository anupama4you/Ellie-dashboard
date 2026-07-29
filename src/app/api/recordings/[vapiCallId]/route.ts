import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'

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

  // Only let a signed-in business fetch a recording that actually belongs to
  // one of their own calls — the vapi_call_id alone shouldn't be enough.
  const { business: biz } = await getCurrentBusiness()
  if (!biz) return new NextResponse('Unauthorized', { status: 401 })

  const supabase = await createClient()
  const { data: call } = await supabase
    .from('calls')
    .select('id')
    .eq('business_id', biz.id)
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
