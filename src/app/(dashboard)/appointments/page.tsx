import { createClient } from '@/lib/supabase/server'
import { CalendarDays, Clock, User, Phone, CalendarCheck, CalendarX } from 'lucide-react'

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  confirmed:   { color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.2)'   },
  pending:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)'   },
  cancelled:   { color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.2)'  },
  completed:   { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.2)'  },
  rescheduled: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)'   },
}

export default async function AppointmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const { data: appointments } = await supabase
    .from('appointments')
    .select('*')
    .eq('business_id', biz?.id)
    .order('scheduled_at', { ascending: false })

  const upcoming = appointments?.filter(a =>
    new Date(a.scheduled_at) >= new Date() && a.status !== 'cancelled'
  ) ?? []

  const past = appointments?.filter(a =>
    new Date(a.scheduled_at) < new Date() || a.status === 'cancelled'
  ) ?? []

  function AppointmentRow({ appt, isLast }: { appt: Record<string, string>; isLast: boolean }) {
    const style = STATUS_STYLE[appt.status] ?? STATUS_STYLE.pending
    const dt    = new Date(appt.scheduled_at)
    return (
      <div
        className="flex items-center justify-between px-5 py-4 gap-4 hover-row transition-colors"
        style={{ borderBottom: isLast ? 'none' : '1px solid var(--b4)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.16)' }}
          >
            <User size={14} style={{ color: '#a78bfa' }} />
          </div>

          {/* Info */}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
              {appt.customer_name}
            </div>
            <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
              {appt.customer_phone && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--t4)' }}>
                  <Phone size={10} style={{ color: 'var(--t5)' }} />
                  {appt.customer_phone}
                </span>
              )}
              {appt.service && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(167,139,250,0.07)',
                    color: '#a78bfa',
                    border: '1px solid rgba(167,139,250,0.14)',
                  }}
                >
                  {appt.service}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Date/time */}
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-sm justify-end" style={{ color: 'var(--t2)' }}>
              <CalendarDays size={12} style={{ color: '#a78bfa' }} />
              {dt.toLocaleDateString('en-AU', { dateStyle: 'medium' })}
            </div>
            <div className="flex items-center gap-1.5 text-xs mt-0.5 justify-end" style={{ color: 'var(--t4)' }}>
              <Clock size={10} />
              {dt.toLocaleTimeString('en-AU', { timeStyle: 'short' })}
            </div>
          </div>

          {/* Status badge */}
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize whitespace-nowrap"
            style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
          >
            {appt.status}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

        {/* Upcoming */}
        <div className="card">
          <div className="card-header">
            <div className="w-1 h-4 rounded-full shrink-0" style={{ background: 'linear-gradient(180deg, #34d399, #6ee7b7)' }} />
            <CalendarCheck size={14} style={{ color: '#34d399' }} />
            <h2 className="text-sm font-semibold flex-1" style={{ color: 'var(--text)' }}>Upcoming</h2>
            {upcoming.length > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}
              >
                {upcoming.length}
              </span>
            )}
          </div>
          {upcoming.length > 0
            ? upcoming.map((a, i) => (
                <AppointmentRow key={a.id} appt={a} isLast={i === upcoming.length - 1} />
              ))
            : (
              <div className="py-14 text-center flex flex-col items-center gap-2">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.1)' }}
                >
                  <CalendarCheck size={18} style={{ color: 'var(--t5)' }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--t4)' }}>No upcoming appointments</p>
              </div>
            )
          }
        </div>

        {/* Past */}
        <div className="card">
          <div className="card-header">
            <div className="w-1 h-4 rounded-full shrink-0" style={{ background: 'rgba(100,116,139,0.4)' }} />
            <CalendarX size={14} style={{ color: 'var(--t4)' }} />
            <h2 className="text-sm font-semibold flex-1" style={{ color: 'var(--text)' }}>Past</h2>
            {past.length > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ background: 'var(--bg4)', color: 'var(--t3)', border: '1px solid var(--b3)' }}
              >
                {past.length}
              </span>
            )}
          </div>
          {past.length > 0
            ? past.map((a, i) => (
                <AppointmentRow key={a.id} appt={a} isLast={i === past.length - 1} />
              ))
            : (
              <div className="py-14 text-center flex flex-col items-center gap-2">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--bg4)', border: '1px solid var(--b3)' }}
                >
                  <CalendarX size={18} style={{ color: 'var(--t5)' }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--t4)' }}>No past appointments</p>
              </div>
            )
          }
        </div>

      </main>
    </div>
  )
}
