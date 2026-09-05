import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
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

/** Whether businessId belongs to one of the given businesses — the ownership check selectLocationAction relies on before ever trusting a client-submitted id. */
export function isOwnedBusinessId<T extends { id: string }>(businesses: T[], businessId: string): boolean {
  return businesses.some(b => b.id === businessId)
}

/** All of a user's locations (businesses rows sharing one user_id), oldest first. */
export async function getUserBusinesses(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  return data ?? []
}

/** The id of whichever of the user's locations is currently selected — see resolveSelectedBusinessId. */
export async function getSelectedBusinessId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const businesses = await getUserBusinesses(supabase, userId)
  const cookieStore = await cookies()
  return resolveSelectedBusinessId(businesses, cookieStore.get(SELECTED_BUSINESS_COOKIE)?.value)
}

/**
 * The dashboard layout and every page under it each need the current user's
 * selected business row (location) plus the full list of their locations,
 * for the location switcher. `cache()` dedupes this to one auth check + one
 * businesses query per request (layout + page render in the same request).
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

  if (!user) return { user: null, business: null, businesses: [] }

  const businesses = await getUserBusinesses(supabase, user.id)
  const cookieStore = await cookies()
  const selectedId = resolveSelectedBusinessId(businesses, cookieStore.get(SELECTED_BUSINESS_COOKIE)?.value)
  const business = businesses.find(b => b.id === selectedId) ?? null

  return { user, business, businesses }
})
