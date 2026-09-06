import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { isWithinOutboundCallingWindow } from '@/lib/outboundWindow'
import { categoryStyle } from '@/lib/callClassify'
import CampaignDetailActions from './CampaignDetailActions'
import CampaignContactsTable from './CampaignContactsTable'
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
    .select('id, name, status, first_message, system_prompt, running, stopped_reason')
    .eq('id', id)
    .eq('business_id', biz.id)
    .single()
  if (!campaign) redirect('/campaigns')

  const { data: contacts } = await supabase
    .from('outbound_campaign_contacts')
    .select('id, name, phone, note, status, outcome, extra_fields')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })

  const allContacts = contacts ?? []
  const callingCount = allContacts.filter(c => c.status === 'calling').length
  const queuedCount = allContacts.filter(c => c.status === 'queued').length
  const doneContacts = allContacts.filter(c => c.status === 'done')
  const withinWindow = isWithinOutboundCallingWindow(new Date(), biz.timezone)

  const outcomeCounts = doneContacts.reduce<Record<string, number>>((acc, c) => {
    const key = c.outcome ?? 'done'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-[1220px] mx-auto flex flex-col gap-5">
        <div>
          <h1 className="font-extrabold text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{campaign.name}</h1>
          <p className="text-xs mt-1 capitalize" style={{ color: 'var(--ink-3)' }}>{campaign.status.replace('_', ' ')} · {(contacts ?? []).length} contacts</p>
        </div>

        {skipped && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
            {skipped} row{skipped === '1' ? '' : 's'} skipped — missing a name/phone or an unrecognisable phone number.
          </div>
        )}

        <CampaignDetailActions
          campaignId={campaign.id}
          status={campaign.status}
          running={campaign.running}
          stoppedReason={campaign.stopped_reason}
          queuedCount={queuedCount}
          withinWindow={withinWindow}
        />

        <section className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Opening line</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>{campaign.first_message}</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--ink-3)' }}>How Ellie will behave on these calls</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>{campaign.system_prompt}</p>
          </div>
        </section>

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

        <CampaignContactsTable
          campaignId={campaign.id}
          contacts={allContacts}
          running={campaign.running}
          withinWindow={withinWindow}
          firstMessage={campaign.first_message}
          systemPrompt={campaign.system_prompt}
        />
      </div>

      {campaign.status === 'active' && <CampaignPolling />}
    </div>
  )
}
