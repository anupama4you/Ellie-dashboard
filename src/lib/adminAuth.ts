import { createClient } from '@/lib/supabase/server'

/**
 * Every admin server action must call this first, before touching
 * createAdminClient() or any data. admin/layout.tsx's redirect only
 * protects the page *render* — Next.js Server Actions are independent
 * POST endpoints dispatched by action id, not re-guarded by the
 * page/layout tree that happened to render them. Any authenticated
 * (even non-admin) user who obtains an action's id from the client
 * bundle could otherwise invoke it directly, bypassing the layout gate
 * entirely. This is the actual authorization boundary for admin
 * mutations — the layout redirect is just a UX nicety on top of it.
 */
export async function assertAdmin(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    throw new Error('Not authorized')
  }
}
