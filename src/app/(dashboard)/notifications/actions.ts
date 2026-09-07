'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { NOTIFICATION_REGISTRY } from '@/lib/notifications'

/** Only explicit `false`s are stored — an unchecked box disables that
 * notification, a checked one is simply omitted (absent = enabled). Same
 * convention as the admin's Dashboard Features save action. */
export async function updateNotificationPreferencesAction(formData: FormData): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) redirect('/notifications?error=nobusiness')
  if (!isFeatureEnabled(biz, 'notifications')) redirect('/notifications?error=disabled')

  const notification_preferences = Object.fromEntries(
    NOTIFICATION_REGISTRY
      .filter(({ key }) => formData.get(key) !== 'on')
      .map(({ key }) => [key, false]),
  )

  const supabase = await createClient()
  const { error } = await supabase.from('businesses').update({ notification_preferences }).eq('id', biz.id)
  if (error) redirect('/notifications?error=save')

  revalidatePath('/notifications')
  redirect('/notifications?saved=1')
}
