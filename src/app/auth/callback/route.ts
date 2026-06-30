import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url  = new URL(request.url)
  const code       = url.searchParams.get('code')
  const token_hash = url.searchParams.get('token_hash')
  const type       = url.searchParams.get('type')
  const next       = url.searchParams.get('next') ?? '/'

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
      await supabase.auth.exchangeCodeForSession(code)
    } else if (token_hash && type) {
      await supabase.auth.verifyOtp({ token_hash, type: type as Parameters<typeof supabase.auth.verifyOtp>[0]['type'] })
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
