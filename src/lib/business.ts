import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * The dashboard layout and every page under it each need the current user's
 * business row. `cache()` dedupes this to a single auth check + query per
 * request (layout + page render in the same request), instead of hitting
 * Supabase Auth and the businesses table twice on every navigation.
 */
export const getCurrentBusiness = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, business: null }

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return { user, business }
})
