import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminClientHeader from '@/components/AdminClientHeader'
import AdminSubmitButton from '@/components/AdminSubmitButton'
import { Megaphone, CheckCircle2 } from 'lucide-react'

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  draft:          { color: 'var(--t5)',    bg: 'var(--b4)' },
  pending_review: { color: 'var(--amber)', bg: 'rgba(217,138,11,0.12)' },
  active:         { color: 'var(--signal)', bg: 'rgba(15,163,122,0.1)' },
  completed:      { color: 'var(--t5)',    bg: 'var(--b4)' },
}

export default async function AdminClientCampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const { id } = await params
  const { saved } = await searchParams

  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('*').eq('id', id).single()
  if (!biz) redirect('/admin/clients')

  const { data: { user: clientUser } } = await admin.auth.admin.getUserById(biz.user_id)
  const clientEmail = clientUser?.email ?? ''

  const { data: campaigns } = await admin
    .from('outbound_campaigns')
    .select('id, name, status, call_instructions, created_at')
    .eq('business_id', id)
    .order('created_at', { ascending: false })

  const campaignIds = (campaigns ?? []).map(c => c.id)
  const { data: contacts } = campaignIds.length
    ? await admin.from('outbound_campaign_contacts').select('campaign_id').in('campaign_id', campaignIds)
    : { data: [] as { campaign_id: string }[] }
  const contactCounts = (contacts ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.campaign_id] = (acc[c.campaign_id] ?? 0) + 1
    return acc
  }, {})

  async function approveCampaignAction(formData: FormData) {
    'use server'
    const admin = createAdminClient()
    const campaignId = formData.get('campaignId') as string
    await admin.from('outbound_campaigns').update({ status: 'active' }).eq('id', campaignId).eq('business_id', id)
    redirect(`/admin/clients/${id}/campaigns?saved=1`)
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">
        <AdminClientHeader
          id={id}
          name={biz.name}
          email={clientEmail}
          plan={biz.plan}
          planStatus={biz.plan_status}
          hasAssistant={!!biz.vapi_assistant_id}
          active="campaigns"
        />

        {saved === '1' && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(15,163,122,0.07)', border: '1px solid rgba(15,163,122,0.2)', color: 'var(--signal)' }}>
            <CheckCircle2 size={15} className="shrink-0" />
            Campaign approved — the client can now start calling.
          </div>
        )}

        {(campaigns ?? []).length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
            <Megaphone size={24} className="mx-auto mb-2" style={{ color: 'var(--t5)' }} />
            <p className="text-sm" style={{ color: 'var(--t5)' }}>No campaigns yet for this client.</p>
          </div>
        ) : (
          (campaigns ?? []).map(c => {
            const statusStyle = STATUS_STYLE[c.status] ?? STATUS_STYLE.draft
            return (
              <div key={c.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--b3)' }}>
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{c.name}</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--t5)' }}>{contactCounts[c.id] ?? 0} contacts</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full capitalize"
                    style={{ color: statusStyle.color, background: statusStyle.bg }}>
                    {c.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="p-5 flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--t3)' }}>How Ellie should behave</p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{c.call_instructions || '—'}</p>
                  </div>
                  {c.status === 'pending_review' && (
                    <form action={approveCampaignAction}>
                      <input type="hidden" name="campaignId" value={c.id} />
                      <AdminSubmitButton
                        pendingLabel="Approving…"
                        icon={<CheckCircle2 size={13} />}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={{ color: 'var(--signal)', background: 'rgba(15,163,122,0.08)', border: '1px solid rgba(15,163,122,0.2)' }}>
                        Approve — let the client start calling
                      </AdminSubmitButton>
                    </form>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
