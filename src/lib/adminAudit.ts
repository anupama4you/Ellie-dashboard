import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Records a sensitive admin-panel action for later review — nothing in
 * this codebase logged who-did-what-when before this. Always re-derives
 * the acting admin from their own live session rather than trusting a
 * value threaded in from elsewhere, since this is the one place we can't
 * afford to misattribute an action.
 *
 * Failure is logged, never thrown — a logging hiccup must never block the
 * real admin action it's attached to.
 */
export async function logAdminAction(params: {
  action: string
  businessId?: string | null
  targetUserId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { error } = await admin.from('admin_audit_log').insert({
    admin_user_id:  user?.id ?? null,
    admin_email:    user?.email ?? 'unknown',
    action:         params.action,
    business_id:    params.businessId ?? null,
    target_user_id: params.targetUserId ?? null,
    metadata:       params.metadata ?? {},
  })
  if (error) console.error('Failed to write admin audit log entry:', error)
}
