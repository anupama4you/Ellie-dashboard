'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CheckCircle2, AlertTriangle } from 'lucide-react'
import { disconnectGoogleCalendar } from '@/app/(dashboard)/settings/actions'

type Props = {
  businessId: string
  connection: { google_email: string | null; status: string } | null
  statusParam?: string
}

export default function GoogleCalendarCard({ businessId, connection, statusParam }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function disconnect() {
    startTransition(async () => {
      await disconnectGoogleCalendar(businessId)
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
        <CalendarDays size={14} style={{ color: 'var(--violet)' }} />
        <div>
          <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Google Calendar</h2>
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Real availability checks and bookings in your own calendar</p>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-3">
        {statusParam === 'error' && (
          <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--coral-soft)', color: 'var(--coral)' }}>
            Something went wrong connecting Google Calendar — please try again.
          </p>
        )}
        {statusParam === 'reconsent' && (
          <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
            Google didn&apos;t return a refresh token — remove Ellie&apos;s access under your Google Account&apos;s
            connected apps, then try connecting again.
          </p>
        )}

        {connection && connection.status === 'connected' ? (
          <>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
              <CheckCircle2 size={14} style={{ color: 'var(--signal)' }} />
              Connected as <span className="font-semibold">{connection.google_email ?? 'your Google account'}</span>
            </div>
            <button
              onClick={disconnect}
              disabled={isPending}
              className="w-fit px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
              style={{ border: '1px solid var(--line)', color: 'var(--coral)' }}
            >
              {isPending ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : connection && connection.status === 'error' ? (
          <>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--coral)' }}>
              <AlertTriangle size={14} />
              Connection needs to be re-authorised
            </div>
            <a href="/api/google-calendar/connect"
              className="w-fit px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--violet)' }}>
              Reconnect Google Calendar
            </a>
          </>
        ) : (
          <a href="/api/google-calendar/connect"
            className="w-fit px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--violet)' }}>
            Connect Google Calendar
          </a>
        )}
      </div>
    </section>
  )
}
