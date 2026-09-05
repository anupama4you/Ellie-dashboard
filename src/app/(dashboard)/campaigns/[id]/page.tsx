import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { isWithinOutboundCallingWindow } from '@/lib/outboundWindow'
import { categoryStyle } from '@/lib/callClassify'
import CampaignDetailActions from './CampaignDetailActions'
import CampaignPolling from '../CampaignPolling'

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ skipped?: string }>
}) {
  const { id } = await params
  const { skipped } = await searchParams
  const { business: biz } = await getCurrentBusiness()
  if (!isFeatureEnabled(biz, 'campaigns')) redirect('/')
  if (!biz) redirect('/')

  const supabase = await createClient()
  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('id, name, status')
    .eq('id', id)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) redirect('/campaigns')

  const { data: contacts } = await supabase
    .from('outbound_campaign_contacts')
    .select('id, name, phone, note, status, outcome')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })

  const allContacts = contacts ?? []
  const pendingCount = allContacts.filter(c => c.status === 'pending').length
  const callingCount = allContacts.filter(c => c.status === 'calling').length
  const doneContacts = allContacts.filter(c => c.status === 'done')
  const withinWindow = isWithinOutboundCallingWindow(new Date(), biz.timezone)

  const outcomeCounts = doneContacts.reduce<Record<string, number>>((acc, c) => {
    const key = c.outcome ?? 'done'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        <div>
          <h1 className="font-extrabold text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{campaign.name}</h1>
          <p className="text-xs mt-1 capitalize" style={{ color: 'var(--ink-3)' }}>{campaign.status} · {(contacts ?? []).length} contacts</p>
        </div>

        {skipped && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
            {skipped} row{skipped === '1' ? '' : 's'} skipped — missing a name/phone or an unrecognisable phone number.
          </div>
        )}

        <CampaignDetailActions campaignId={campaign.id} status={campaign.status} pendingCount={pendingCount} withinWindow={withinWindow} />

        {allContacts.length > 0 && (
          <section className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {doneContacts.length} of {allContacts.length} contacted
              </p>
              {callingCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--violet)' }}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--violet)' }} />
                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--violet)' }} />
                  </span>
                  {callingCount} calling now
                </span>
              )}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(doneContacts.length / allContacts.length) * 100}%`, background: 'var(--signal)' }} />
            </div>
            {Object.keys(outcomeCounts).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(outcomeCounts).map(([outcome, count]) => {
                  const style = categoryStyle(outcome)
                  return (
                    <span key={outcome} className="text-xs font-semibold px-2 py-1 rounded-full" style={{ color: style.color, background: style.bg }}>
                      {count} {style.label.toLowerCase()}
                    </span>
                  )
                })}
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Contacts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th className="text-left font-semibold px-5 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Name</th>
                  <th className="text-left font-semibold px-5 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Phone</th>
                  <th className="text-left font-semibold px-5 py-2.5" style={{ color: 'var(--ink-3)' }}>Note</th>
                  <th className="text-left font-semibold px-5 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {allContacts.map((c, i) => {
                  const pill = c.status === 'done'
                    ? categoryStyle(c.outcome ?? 'done')
                    : c.status === 'calling'
                      ? { label: 'Calling', color: 'var(--violet)', bg: 'var(--violet-soft)' }
                      : { label: 'Pending', color: 'var(--ink-3)', bg: 'var(--paper)' }
                  return (
                    <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                      <td className="px-5 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--ink)' }}>{c.name}</td>
                      <td className="px-5 py-3 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>{c.phone}</td>
                      <td className="px-5 py-3" style={{ color: 'var(--ink-3)' }}>{c.note ?? '—'}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full" style={{ color: pill.color, background: pill.bg }}>
                          {c.status === 'calling' && (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: pill.color }} />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: pill.color }} />
                            </span>
                          )}
                          {pill.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {campaign.status === 'active' && <CampaignPolling />}
    </div>
  )
}
