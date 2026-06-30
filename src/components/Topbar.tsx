import { createClient } from '@/lib/supabase/server'

export default async function Topbar({ title }: { title: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: biz } = await supabase
    .from('businesses')
    .select('name, plan')
    .eq('user_id', user?.id)
    .single()

  return (
    <header className="flex items-center justify-between px-6 h-16 shrink-0 relative"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(3,7,18,0.95)' }}>

      {/* Subtle bottom gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(167,139,250,0.15), transparent)' }} />

      {/* Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold tracking-tight" style={{ color: '#e2e8f0' }}>{title}</h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Live badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{
            background: 'rgba(52,211,153,0.07)',
            border: '1px solid rgba(52,211,153,0.18)',
            color: '#34d399',
          }}>
          <span className="w-1.5 h-1.5 rounded-full animate-ellie-pulse"
            style={{ background: '#34d399', boxShadow: '0 0 5px #34d399' }} />
          Ellie Live
        </div>

        {/* Business pill */}
        {biz && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
            <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>{biz.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold capitalize"
              style={{
                background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(244,114,182,0.1))',
                color: '#a78bfa',
                border: '1px solid rgba(167,139,250,0.25)',
              }}>
              {biz.plan}
            </span>
          </div>
        )}
      </div>
    </header>
  )
}
