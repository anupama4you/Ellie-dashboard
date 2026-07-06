import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminNav from '@/components/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (user.email !== process.env.ADMIN_EMAIL) redirect('/')

  return (
    <div data-theme="admin" className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <AdminNav />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
