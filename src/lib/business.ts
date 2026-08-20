import { cache } from 'react'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

type AppUser = { id: string; email: string | undefined }

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
