'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { revokeToken } from '@/lib/googleCalendar'
import { decrypt } from '@/lib/crypto'
import { isOwnedBusinessId, getUserBusinesses } from '@/lib/business'

export async function disconnectGoogleCalendar(businessId: string) {
  const supabase = await createClient()

  // RLS already backstops this (calendar_connections is scoped to the
  // caller's own businesses), but every other action in this codebase
  // verifies ownership explicitly before trusting a client-supplied id —
  // matching that here for defense-in-depth consistency rather than relying
  // on RLS alone.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const businesses = await getUserBusinesses(supabase, user.id)
  if (!isOwnedBusinessId(businesses, businessId)) throw new Error('Not authorized for this business')

  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('refresh_token_encrypted')
    .eq('business_id', businessId)
    .single()

  if (conn) {
    try { await revokeToken(decrypt(conn.refresh_token_encrypted)) } catch { /* best-effort */ }
  }

  const { error } = await supabase.from('calendar_connections').delete().eq('business_id', businessId)
  if (error) throw new Error(error.message)
  revalidatePath('/integrations')
  revalidatePath('/appointments')
}
