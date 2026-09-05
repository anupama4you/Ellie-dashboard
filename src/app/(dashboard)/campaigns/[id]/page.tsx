import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { isWithinOutboundCallingWindow } from '@/lib/outboundWindow'
import CampaignDetailActions from './CampaignDetailActions'

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

  const pendingCount = (contacts ?? []).filter(c => c.status === 'pending').length
  const withinWindow = isWithinOutboundCallingWindow(new Date(), biz.timezone)

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

        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Contacts</h2>
          </div>
          {(contacts ?? []).map((c, i) => (
            <div key={c.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{c.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{c.phone}{c.note ? ` · ${c.note}` : ''}</p>
              </div>
              <p className="text-xs font-semibold capitalize" style={{ color: 'var(--ink-3)' }}>
                {c.status === 'done' ? (c.outcome ?? 'done') : c.status}
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
