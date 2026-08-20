import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Publicly accessible regardless of auth state — legal pages need to be
  // reachable by anyone (Google's OAuth verification reviewer included),
  // not just signed-in users.
  const PUBLIC_PATHS = ['/login', '/privacy', '/terms']
  if (!user && !PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Forward this request's already-verified identity so getCurrentBusiness()
  // doesn't have to pay for a second auth.getUser() round-trip (a real
  // network call to the Auth server) on every single dashboard page render.
  // Always set-or-clear both headers here — never leave whatever the client
  // originally sent — so nothing forged on the incoming request can survive
  // through to the page unverified.
  const requestHeaders = new Headers(request.headers)
  if (user) {
    requestHeaders.set('x-verified-user-id', user.id)
    requestHeaders.set('x-verified-user-email', user.email ?? '')
  } else {
    requestHeaders.delete('x-verified-user-id')
    requestHeaders.delete('x-verified-user-email')
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.png|logo.png|dark-logo.png|api/|auth/).*)'],
}
