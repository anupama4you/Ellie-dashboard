import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { getSmsMessages, groupIntoThreads, phoneDigitsKey, formatAuPhone } from '@/lib/sms'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import SmsInbox, { type ThreadListItem } from '@/components/SmsInbox'
import { MessagesSquare } from 'lucide-react'

export default async function SmsPage() {
  const { business: biz } = await getCurrentBusiness()
  if (!isFeatureEnabled(biz, 'sms')) redirect('/')

  let threads: ThreadListItem[] = []
  let fetchError: string | null = null

  if (!biz) {
    fetchError = 'No business profile found.'
  } else if (!biz.twilio_phone_number) {
    fetchError = 'No Twilio number set on your business profile yet — there\'s nothing to show until one\'s connected.'
  } else {
    try {
      // Most recent 200 per direction — bounded batch rather than paging
      // through Twilio's full history, so anything older isn't reachable yet.
      const messages = await getSmsMessages(biz.twilio_phone_number, 200)
      const grouped = groupIntoThreads(messages)

      // Two name sources, merged: `customers` (built from every call, first
      // name wins permanently) and `appointments.customer_name` (real
      // bookings) — a phone known only through a booking, never a call,
      // still gets its name shown. `customers` takes priority as the
      // dedicated, deliberately-stable identity store.
      const supabase = await createClient()
      const [{ data: customers }, { data: appts }] = await Promise.all([
        supabase.from('customers').select('phone, name').eq('business_id', biz.id),
        supabase.from('appointments').select('customer_name, customer_phone').eq('business_id', biz.id).not('customer_phone', 'is', null),
      ])
      const nameByPhone = new Map<string, string>()
      for (const a of appts ?? []) {
        if (a.customer_phone && a.customer_name) nameByPhone.set(phoneDigitsKey(a.customer_phone), a.customer_name)
      }
      for (const c of customers ?? []) {
        if (c.phone && c.name) nameByPhone.set(c.phone, c.name)
      }

      threads = grouped.map(t => ({
        phone: t.phone,
        displayPhone: formatAuPhone(t.displayPhone),
        rawPhone: t.displayPhone,
        name: nameByPhone.get(phoneDigitsKey(t.displayPhone)) ?? null,
        messages: t.messages.map(m => ({
          sid: m.sid,
          body: m.body,
          status: m.status,
          direction: m.direction,
          dateSent: m.dateSent,
        })),
      }))
    } catch (err) {
      console.error('Failed to fetch SMS messages from Twilio:', err)
      fetchError = 'Could not reach Twilio — check TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN and the business\'s Twilio number.'
    }
  }

  return (
    <div className="h-full overflow-hidden">
      {fetchError ? (
        <div className="p-3 sm:p-6 max-w-[1220px] mx-auto">
          <div className="rounded-2xl py-12 text-center px-6 flex flex-col items-center gap-2"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--coral-soft)' }}>
              <MessagesSquare size={16} style={{ color: 'var(--coral)' }} />
            </div>
            <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>Setup required</p>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{fetchError}</p>
          </div>
        </div>
      ) : (
        <SmsInbox threads={threads} timeZone={biz?.timezone ?? 'Australia/Adelaide'} />
      )}
    </div>
  )
}
