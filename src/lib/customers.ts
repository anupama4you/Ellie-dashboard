import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneDigitsKey } from '@/lib/sms'

/**
 * Remembers a customer's name against their phone number for this business,
 * so it can be reused later without asking every time — not read anywhere
 * yet, this just starts accumulating the data.
 *
 * First name wins, permanently — a phone number can outlive the person who
 * first used it (shared family line, or the same test number used under
 * different names), so a later call giving a different name for the same
 * number is silently ignored rather than overwriting what's there. `ON
 * CONFLICT DO NOTHING` makes this atomic/race-free at the DB level, unlike
 * a SELECT-then-INSERT which two near-simultaneous calls could both pass.
 *
 * Best-effort: a failure here should never break whatever booking/call flow
 * triggered it, so errors are logged, not thrown.
 */
export async function rememberCustomerName(
  supabase: SupabaseClient,
  businessId: string,
  phone: string | null | undefined,
  name: string | null | undefined,
): Promise<void> {
  const trimmedName = name?.trim()
  if (!phone || !trimmedName) return

  const key = phoneDigitsKey(phone)
  if (key.length < 6) return // too short to be a real number — avoid garbage keys

  const { error } = await supabase
    .from('customers')
    .upsert(
      { business_id: businessId, phone: key, name: trimmedName },
      { onConflict: 'business_id,phone', ignoreDuplicates: true },
    )
  if (error) console.error('Failed to save customer name:', error)
}
