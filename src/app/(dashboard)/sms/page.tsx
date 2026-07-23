import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { getSmsLog, phoneDigitsKey, formatAuPhone, type SmsLogEntry } from '@/lib/sms'
import { dateStrInZone, startOfMonthInZone, formatInZone } from '@/lib/timezone'
import { MessageSquare, CheckCircle2, AlertTriangle, MessagesSquare, ChevronLeft, ChevronRight } from 'lucide-react'

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  delivered: { label: 'Delivered', color: 'var(--signal)', bg: 'var(--signal-soft)' },
  sent:      { label: 'Sent',      color: 'var(--violet)', bg: 'var(--violet-soft)' },
  queued:    { label: 'Sending…',  color: 'var(--amber)',  bg: 'var(--amber-soft)'  },
  sending:   { label: 'Sending…',  color: 'var(--amber)',  bg: 'var(--amber-soft)'  },
  failed:     { label: 'Failed',     color: 'var(--coral)', bg: 'var(--coral-soft)' },
  undelivered:{ label: 'Undelivered', color: 'var(--coral)', bg: 'var(--coral-soft)' },
}

type Category = 'all' | 'booking' | 'rescheduled' | 'cancelled' | 'failed'
const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'booking', label: 'Bookings' },
  { key: 'rescheduled', label: 'Reschedules' },
  { key: 'cancelled', label: 'Cancellations' },
  { key: 'failed', label: 'Failed' },
]

/**
 * Twilio only knows message bodies and delivery status, not "why" a text was
 * sent — categorize by matching the exact phrasing each of our own SMS
 * templates uses (bookAppointment/rescheduleAppointment/cancelAppointment in
 * the webhook, and their dashboard-triggered equivalents in
 * appointments/actions.ts, all share the same wording deliberately). Real
 * delivery failures take priority over content matching since a failed send
 * is worth surfacing regardless of what it was for.
 */
function categorize(m: SmsLogEntry): Category | 'other' {
  if (m.status === 'failed' || m.status === 'undelivered') return 'failed'
  if (m.body.includes('is confirmed for')) return 'booking'
  if (m.body.includes('has been moved to')) return 'rescheduled'
  if (m.body.includes('has been cancelled')) return 'cancelled'
  return 'other'
}

const PAGE_SIZE = 15

export default async function SmsLogPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>
}) {
  const { filter: filterParam, page: pageParam } = await searchParams
  const filter: Category = CATEGORIES.some(c => c.key === filterParam) ? (filterParam as Category) : 'all'

  const { business: biz } = await getCurrentBusiness()
  const timeZone = biz?.timezone ?? 'Australia/Adelaide'

  let messages: SmsLogEntry[] = []
  let fetchError: string | null = null

  if (!biz) {
    fetchError = 'No business profile found.'
  } else if (!biz.twilio_phone_number) {
    fetchError = 'No Twilio number set on your business profile yet — SMS confirmations need one before there\'s anything to log.'
  } else {
    try {
      // Most recent 200 — real pagination below then slices this bounded
      // batch rather than round-tripping to Twilio per page, so history
      // older than that isn't reachable yet.
      messages = await getSmsLog(biz.twilio_phone_number, 200)
    } catch (err) {
      console.error('Failed to fetch SMS log from Twilio:', err)
      fetchError = 'Could not reach Twilio — check TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN and the business\'s Twilio number.'
    }
  }

  const categoryCounts = Object.fromEntries(
    CATEGORIES.map(c => [c.key, c.key === 'all' ? messages.length : messages.filter(m => categorize(m) === c.key).length])
  ) as Record<Category, number>

  const filteredMessages = filter === 'all' ? messages : messages.filter(m => categorize(m) === filter)

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, parseInt(pageParam ?? '1', 10) || 1), totalPages)
  const pageMessages = filteredMessages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function pageHref(p: number) {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('filter', filter)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/sms${qs ? `?${qs}` : ''}`
  }

  function filterHref(c: Category) {
    return c === 'all' ? '/sms' : `/sms?filter=${c}`
  }

  // Best-effort name lookup: Twilio only knows phone numbers, so match each
  // message's `to` against appointments we've booked for that number.
  const nameByPhone = new Map<string, string>()
  if (biz && messages.length) {
    const supabase = await createClient()
    const { data: appts } = await supabase
      .from('appointments')
      .select('customer_name, customer_phone')
      .eq('business_id', biz.id)
      .not('customer_phone', 'is', null)
    for (const a of appts ?? []) {
      if (a.customer_phone) nameByPhone.set(phoneDigitsKey(a.customer_phone), a.customer_name)
    }
  }

  const now = new Date()
  const monthStart = startOfMonthInZone(now, timeZone)
  const thisMonth = messages.filter(m => m.dateSent && new Date(m.dateSent) >= monthStart)
  const delivered = thisMonth.filter(m => m.status === 'delivered').length
  const deliveredPct = thisMonth.length > 0 ? Math.round((delivered / thisMonth.length) * 100) : 100

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">
        <div>
          <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
            SMS log
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
            Booking confirmations Ellie has sent to your customers
          </p>
        </div>

        {fetchError ? (
          <div className="rounded-2xl py-12 text-center px-6 flex flex-col items-center gap-2"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--coral-soft)' }}>
              <MessagesSquare size={16} style={{ color: 'var(--coral)' }} />
            </div>
            <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>Setup required</p>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{fetchError}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Sent this month</span>
                  <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center" style={{ background: 'var(--violet-soft)' }}>
                    <MessageSquare size={13} style={{ color: 'var(--violet)' }} />
                  </span>
                </div>
                <p className="font-extrabold mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>{thisMonth.length}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Booking confirmations</p>
              </div>

              <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Delivered</span>
                  <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center" style={{ background: 'var(--signal-soft)' }}>
                    <CheckCircle2 size={13} style={{ color: 'var(--signal)' }} />
                  </span>
                </div>
                <p className="font-extrabold mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>{deliveredPct}%</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{delivered} of {thisMonth.length} delivered</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {CATEGORIES.map(c => {
                const active = c.key === filter
                return (
                  <Link
                    key={c.key}
                    href={filterHref(c.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                    style={active
                      ? { background: 'var(--violet)', color: '#fff' }
                      : { background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
                  >
                    {c.label}
                    <span
                      className="text-[0.65rem] font-bold rounded-full px-1.5 leading-[1.15rem]"
                      style={active ? { background: 'rgba(255,255,255,0.25)' } : { background: 'var(--paper)', color: 'var(--ink-3)' }}
                    >
                      {categoryCounts[c.key]}
                    </span>
                  </Link>
                )
              })}
            </div>

            <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
              <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
                <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Recent messages</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Sent from your Ellie number</p>
              </div>

              {filteredMessages.length === 0 ? (
                <div className="py-14 text-center flex flex-col items-center gap-2">
                  <MessagesSquare size={18} style={{ color: 'var(--ink-3)' }} />
                  <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                    {messages.length === 0 ? 'No messages sent yet' : 'No messages in this category'}
                  </p>
                </div>
              ) : (
                pageMessages.map((m, i) => {
                  const status = STATUS_STYLE[m.status] ?? { label: m.status, color: 'var(--ink-3)', bg: 'var(--paper)' }
                  const name = nameByPhone.get(phoneDigitsKey(m.to))
                  const when = m.dateSent ? new Date(m.dateSent) : null
                  const isToday = when && dateStrInZone(when, timeZone) === dateStrInZone(now, timeZone)
                  return (
                    <div key={m.sid} className="flex items-start gap-4 px-5 py-4"
                      style={{ borderTop: i > 0 ? '1px solid var(--line)' : undefined }}>
                      <div className="shrink-0" style={{ width: 150 }}>
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{name || formatAuPhone(m.to)}</p>
                        {name && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{formatAuPhone(m.to)}</p>}
                      </div>
                      <p className="flex-1 text-sm min-w-0" style={{ color: 'var(--ink-2)' }}>{m.body}</p>
                      <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                        <span className="text-xs font-mono" style={{ color: 'var(--ink-3)' }}>
                          {when ? (isToday
                            ? `Today ${formatInZone(when, timeZone, { hour: 'numeric', minute: '2-digit' })}`
                            : formatInZone(when, timeZone, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
                          ) : '—'}
                        </span>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1"
                          style={{ color: status.color, background: status.bg }}>
                          {(m.status === 'failed' || m.status === 'undelivered') && <AlertTriangle size={10} />}
                          {status.label}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}

              {filteredMessages.length > 0 && (
                <div className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: '1px solid var(--line)' }}>
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    Page {page} of {totalPages} · {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {page > 1 ? (
                      <Link href={pageHref(page - 1)} className="w-7 h-7 rounded-lg flex items-center justify-center btn-ghost" style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}>
                        <ChevronLeft size={13} />
                      </Link>
                    ) : (
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ border: '1px solid var(--line)', color: 'var(--ink-4, var(--ink-3))', opacity: 0.4 }}>
                        <ChevronLeft size={13} />
                      </span>
                    )}
                    {page < totalPages ? (
                      <Link href={pageHref(page + 1)} className="w-7 h-7 rounded-lg flex items-center justify-center btn-ghost" style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}>
                        <ChevronRight size={13} />
                      </Link>
                    ) : (
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ border: '1px solid var(--line)', color: 'var(--ink-4, var(--ink-3))', opacity: 0.4 }}>
                        <ChevronRight size={13} />
                      </span>
                    )}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
