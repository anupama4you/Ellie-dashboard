import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { createCampaignAction } from './actions'
import CsvDropzone from './CsvDropzone'
import CampaignPolling from './CampaignPolling'
import { Megaphone, Plus } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  nobusiness: 'No business profile found.',
  disabled: 'Campaigns are not enabled for this location.',
  noinstructions: 'Fill in what Ellie says first and how she should behave.',
  nofile: 'Choose a CSV file to upload.',
  novalid: 'No valid contacts found in that file — check it has name and phone columns.',
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
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
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
              Upload a CSV with <code>name</code>, <code>phone</code>, and an optional <code>note</code> column — this is exactly who Ellie will call, so filter the list yourself before uploading.
            </p>
          </div>
          <form action={createCampaignAction} className="p-5 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Campaign name</label>
              <input type="text" name="name" required placeholder="Spring re-engagement" className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="campaign-first-message" className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Opening line</label>
              <textarea id="campaign-first-message" name="firstMessage" required rows={2}
                defaultValue={biz.outbound_default_first_message ?? ''}
                placeholder="Hi, this is Ellie calling from [Business]."
                className="rounded-lg px-3 py-2 text-sm resize-y" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>What Ellie says the moment the call connects.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="campaign-system-prompt" className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>How should Ellie behave on these calls?</label>
              <textarea id="campaign-system-prompt" name="systemPrompt" required rows={4}
                defaultValue={biz.outbound_default_system_prompt ?? ''}
                placeholder="Mention it's been a while since their last visit, and offer to book them in this week."
                className="rounded-lg px-3 py-2 text-sm resize-y" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                Pre-filled with your usual script — edit it for this campaign if you want.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="campaign-csv" className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Contacts CSV</label>
              <CsvDropzone inputId="campaign-csv" />
            </div>
            <button type="submit" className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--violet)' }}>
              <span className="flex items-center gap-1.5"><Plus size={14} /> Create campaign</span>
            </button>
          </form>
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
