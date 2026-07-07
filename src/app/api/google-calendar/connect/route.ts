import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUrl } from '@/lib/googleCalendar'

const NONCE_COOKIE = 'gcal_oauth_state'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.APP_URL))

  const nonce = randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set(NONCE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' })

  return NextResponse.redirect(getAuthUrl(nonce))
}
