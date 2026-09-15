import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * `next` comes straight from the query string on a trusted auth domain,
 * right after a real login/magic-link/recovery flow — prime open-redirect
 * bait. `new URL(absoluteUrl, origin)` ignores `origin` entirely when the
 * first argument is already absolute, and `//evil.com` is a protocol-relative
 * URL browsers treat the same way, so both must be rejected, not just bare
 * `http(s)://` strings. Only a same-origin relative path is ever allowed.
 */
function safeNextPath(next: string): string {
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}

export async function GET(request: Request) {
  const url  = new URL(request.url)
  const code       = url.searchParams.get('code')
  const token_hash = url.searchParams.get('token_hash')
  const type       = url.searchParams.get('type')
  const next       = safeNextPath(url.searchParams.get('next') ?? '/')

  let verifyError: string | null = null

  if (code || (token_hash && type)) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()  { return cookieStore.getAll() },
          setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        },
      }
    )

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      verifyError = error?.message ?? null
    } else if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as Parameters<typeof supabase.auth.verifyOtp>[0]['type'] })
      verifyError = error?.message ?? null
    }
  }

  // /auth/set-password already shows a friendly "this link has expired" state
  // on its own (it checks for a session client-side) — redirecting those
  // failures elsewhere would just replace one graceful empty state with a
  // worse one. Every other `next` (e.g. the admin's "View as Client"
  // impersonation link, which is one-time-use and ~1hr-lived) had no such
  // handling — it silently landed on `next` with no session, which the
  // middleware then silently bounced to /login with zero explanation.
  if (verifyError && !next.startsWith('/auth/set-password')) {
    return NextResponse.redirect(new URL('/login?error=link_expired', url.origin))
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
