'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type NotificationPrefs = {
  bookingTexts: boolean
  morningBrief: boolean
  urgentAlerts: boolean
  weeklyReport: boolean
}

export async function updateNotificationPrefs(businessId: string, prefs: NotificationPrefs) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('businesses')
    .update({ notification_prefs: prefs })
    .eq('id', businessId)

  if (error) throw new Error(error.message)
  revalidatePath('/settings')
}
