import { redirect } from 'next/navigation'
import { MessagesSquare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSmsMessages, groupIntoThreads, phoneDigitsKey, formatAuPhone } from '@/lib/sms'
import AdminClientHeader from '@/components/AdminClientHeader'
import SmsInbox, { type ThreadListItem } from '@/components/SmsInbox'

export default async function AdminClientMessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('*').eq('id', id).single()
  if (!biz) redirect('/admin/clients')

  const { data: { user: clientUser } } = await admin.auth.admin.getUserById(biz.user_id)

  let threads: ThreadListItem[] = []
  let fetchError: string | null = null

  if (!biz.twilio_phone_number) {
    fetchError = 'No Twilio number set on this business\'s profile yet — there\'s nothing to show until one\'s connected.'
  } else {
    try {
      const messages = await getSmsMessages(biz.twilio_phone_number, 200)
      const grouped = groupIntoThreads(messages)

      // Same two name sources as the client-facing Messages page merges —
      // see src/app/(dashboard)/sms/page.tsx — just via the admin client
      // since this business isn't the signed-in user's own.
      const [{ data: customers }, { data: appts }] = await Promise.all([
        admin.from('customers').select('phone, name').eq('business_id', biz.id),
        admin.from('appointments').select('customer_name, customer_phone').eq('business_id', biz.id).not('customer_phone', 'is', null),
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
      console.error('Failed to fetch SMS messages from Twilio for admin:', err)
      fetchError = 'Could not reach Twilio — check TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN and this business\'s Twilio number.'
    }
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="p-4 sm:p-6 pb-0 max-w-[1220px] w-full mx-auto shrink-0">
        <AdminClientHeader
          id={biz.id}
          name={biz.name}
          email={clientUser?.email ?? ''}
          plan={biz.plan}
          planStatus={biz.plan_status}
          hasAssistant={!!biz.vapi_assistant_id}
          active="messages"
        />
      </div>

      <div className="flex-1 min-h-0">
        {fetchError ? (
          <div className="p-4 sm:p-6 max-w-[1220px] mx-auto">
            <div className="rounded-2xl py-12 text-center px-6 flex flex-col items-center gap-2"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(221,81,64,0.1)' }}>
                <MessagesSquare size={16} style={{ color: 'var(--coral)' }} />
              </div>
              <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>Setup required</p>
              <p className="text-sm" style={{ color: 'var(--t3)' }}>{fetchError}</p>
            </div>
          </div>
        ) : (
          <SmsInbox threads={threads} timeZone={biz.timezone ?? 'Australia/Adelaide'} readOnly />
        )}
      </div>
    </div>
  )
}
