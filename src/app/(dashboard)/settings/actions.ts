'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { revokeToken } from '@/lib/googleCalendar'
import { decrypt } from '@/lib/crypto'

export async function disconnectGoogleCalendar(businessId: string) {
  const supabase = await createClient()

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
  revalidatePath('/settings')
  revalidatePath('/appointments')
}
