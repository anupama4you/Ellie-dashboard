import { cache } from 'react'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

type AppUser = { id: string; email: string | undefined }

export const SELECTED_BUSINESS_COOKIE = 'selected_business_id'

/**
 * Picks which of a user's business rows (locations) is "current." A cookie
 * value that matches one of their own rows wins; otherwise (no cookie, a
 * stale cookie from a deleted location, or one belonging to someone else)
 * falls back to the oldest row — the same single business a one-location
 * client has always seen. Pure and DB-free so it's unit-testable without
 * mocking Supabase or Next's cookie jar.
 */
export function resolveSelectedBusinessId<T extends { id: string }>(
  businesses: T[],
  cookieBusinessId: string | undefined,
): string | null {
  if (businesses.length === 0) return null
  if (cookieBusinessId && businesses.some(b => b.id === cookieBusinessId)) return cookieBusinessId
  return businesses[0].id
}

/**
 * The dashboard layout and every page under it each need the current user's
 * business row. `cache()` dedupes this to a single auth check + query per
 * request (layout + page render in the same request), instead of hitting
 * Supabase Auth and the businesses table twice on every navigation.
 *
 * proxy.ts already ran a real, server-verified auth.getUser() for this exact
 * request and forwards the result via trusted headers — reuse that instead
 * of paying for a second Auth-server round trip on every page render. Only
 * routes proxy.ts's matcher excludes (currently /api/*) won't have these
 * set, so fall back to a real check there.
 */
export const getCurrentBusiness = cache(async () => {
  const supabase = await createClient()

  const hdrs = await headers()
  const verifiedId = hdrs.get('x-verified-user-id')

  let user: AppUser | null
  if (verifiedId) {
    user = { id: verifiedId, email: hdrs.get('x-verified-user-email') || undefined }
  } else {
    const { data } = await supabase.auth.getUser()
    user = data.user ? { id: data.user.id, email: data.user.email } : null
  }

  if (!user) return { user: null, business: null }

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return { user, business }
})
