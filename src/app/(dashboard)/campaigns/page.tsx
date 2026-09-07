import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { createCampaignAction } from './actions'
import CampaignComposer from './CampaignComposer'
import CampaignPolling from './CampaignPolling'
import { Megaphone } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  nobusiness: 'No business profile found.',
  disabled: 'Campaigns are not enabled for this location.',
  noinstructions: 'Fill in what Ellie says first and how she should behave.',
  noconsent: 'Confirm you have the right to contact these customers before creating the campaign.',
  noschedule: 'Pick a date and time to schedule this campaign.',
  schedulepast: 'Pick a date and time in the future.',
  schedulefar: 'Campaigns can only be scheduled up to 7 days in advance.',
  novalid: 'No valid contacts found — check your CSV has name and phone columns, or the numbers you typed in manually.',
  create: 'Failed to create the campaign. Please try again.',
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const { business: biz } = await getCurrentBusiness()
  if (!isFeatureEnabled(biz, 'campaigns')) redirect('/')
  if (!biz) redirect('/')

  const supabase = await createClient()
  const { data: campaigns } = await supabase
    .from('outbound_campaigns')
    .select('id, name, status, created_at')
    .eq('business_id', biz.id)
    .order('created_at', { ascending: false })

  const counts = Object.fromEntries(
    await Promise.all((campaigns ?? []).map(async c => {
      const { count: total } = await supabase.from('outbound_campaign_contacts').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id)
      const { count: done } = await supabase.from('outbound_campaign_contacts').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'done')
      return [c.id, { total: total ?? 0, done: done ?? 0 }]
    })),
  )

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-[1220px] mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <Megaphone size={20} style={{ color: 'var(--ink)' }} />
          <h1 className="font-extrabold text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Campaigns</h1>
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--coral-soft)', color: 'var(--coral)' }}>
            {ERROR_MESSAGES[error] ?? 'Something went wrong. Please try again.'}
          </div>
        )}

        <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>New campaign</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
              Upload a CSV with <code>name</code>, <code>phone</code>, and any other columns you like — this is exactly who Ellie will call, so filter the list yourself before uploading.
            </p>
          </div>
          <CampaignComposer
            action={createCampaignAction}
            defaultFirstMessage={biz.outbound_default_first_message ?? ''}
            defaultSystemPrompt={biz.outbound_default_system_prompt ?? ''}
            timezone={biz.timezone}
          />
        </section>

        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Your campaigns</h2>
          </div>
          {(campaigns ?? []).length === 0 ? (
            <p className="text-sm p-5" style={{ color: 'var(--ink-3)' }}>No campaigns yet.</p>
          ) : (
            (campaigns ?? []).map((c, i) => {
              const { done = 0, total = 0 } = counts[c.id] ?? {}
              const pct = total ? Math.round((done / total) * 100) : 0
              return (
                <Link key={c.id} href={`/campaigns/${c.id}`}
                  className="flex flex-col gap-2 px-5 py-3 hover:bg-black/[0.02] transition-colors"
                  style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{c.name}</p>
                      <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--ink-3)' }}>{c.status.replace('_', ' ')}</p>
                    </div>
                    <p className="text-xs font-mono" style={{ color: 'var(--ink-3)' }}>{done}/{total} done</p>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--signal)' }} />
                  </div>
                </Link>
              )
            })
          )}
        </section>
      </div>

      {(campaigns ?? []).some(c => c.status === 'active') && <CampaignPolling />}
    </div>
  )
}
