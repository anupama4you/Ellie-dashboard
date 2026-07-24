import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, getUserEmail } from '@/lib/googleCalendar'
import { encrypt } from '@/lib/crypto'

const NONCE_COOKIE = 'gcal_oauth_state'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const base = process.env.APP_URL!

  const cookieStore = await cookies()
  const expectedNonce = cookieStore.get(NONCE_COOKIE)?.value
  cookieStore.delete(NONCE_COOKIE)

  if (!code || !state || !expectedNonce || state !== expectedNonce) {
    return NextResponse.redirect(new URL('/integrations?calendar=error', base))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', base))

  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).single()
  if (!biz) return NextResponse.redirect(new URL('/integrations?calendar=error', base))

  try {
    const tokens = await exchangeCodeForTokens(code)
    if (!tokens.refresh_token) {
      // Google only returns a refresh token on the *first* consent — if the
      // user had already granted access before without revoking, re-consent
      // (prompt=consent on our auth URL should prevent this, but guard anyway).
      return NextResponse.redirect(new URL('/integrations?calendar=reconsent', base))
    }

    const email = await getUserEmail(tokens.access_token)
    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const { error } = await supabase.from('calendar_connections').upsert({
      business_id: biz.id,
      provider: 'google',
      calendar_id: 'primary',
      google_email: email ?? null,
      access_token_encrypted: encrypt(tokens.access_token),
      refresh_token_encrypted: encrypt(tokens.refresh_token),
      token_expiry: tokenExpiry,
      status: 'connected',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' })

    if (error) {
      console.error('Failed to save calendar connection:', error)
      return NextResponse.redirect(new URL('/integrations?calendar=error', base))
    }

    return NextResponse.redirect(new URL('/integrations?calendar=connected', base))
  } catch (err) {
    console.error('Google Calendar OAuth callback failed:', err)
    return NextResponse.redirect(new URL('/integrations?calendar=error', base))
  }
}
