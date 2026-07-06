import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminNav from '@/components/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (user.email !== process.env.ADMIN_EMAIL) redirect('/')

  const admin = createAdminClient()
  const { count } = await admin
    .from('businesses')
    .select('id', { count: 'exact', head: true })
    .eq('briefing_needs_review', true)

  return (
    <div data-theme="admin" className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <AdminNav pendingReviewCount={count ?? 0} />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
