'use client'

import { useState, useTransition } from 'react'
import type { CompanyInfo } from '@/app/(dashboard)/briefing/actions'
import { updateDraftCompanyInfo, updateLiveCompanyInfo } from '@/app/admin/clients/[id]/briefing/actions'

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']

type Props = {
  businessId: string
  hasDraft: boolean
  draftCompanyInfo: CompanyInfo
  liveCompanyInfo: CompanyInfo
}

export default function AdminCompanyInfoEditor({ businessId, hasDraft, draftCompanyInfo, liveCompanyInfo }: Props) {
  const [companyInfo, setCompanyInfo] = useState(hasDraft ? draftCompanyInfo : liveCompanyInfo)
  const [isPending, startTransition]  = useTransition()
  const [status, setStatus]           = useState<'idle' | 'saved' | 'error'>('idle')

  const changed = hasDraft && JSON.stringify(companyInfo) !== JSON.stringify(liveCompanyInfo)

  function save() {
    startTransition(async () => {
      try {
        if (hasDraft) {
          await updateDraftCompanyInfo(businessId, companyInfo)
        } else {
          await updateLiveCompanyInfo(businessId, companyInfo)
        }
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2500)
      } catch {
        setStatus('error')
      }
    })
  }

  return (
    <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Company Information</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
            {hasDraft ? 'Editable — correct what the client submitted before applying' : 'Editable — saves straight to live data'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {changed && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: 'var(--amber)', background: 'rgba(217,138,11,0.12)' }}>
              Changed
            </span>
          )}
          {status === 'saved' && (
            <span className="text-xs font-semibold" style={{ color: 'var(--signal)' }}>
              {hasDraft ? 'Saved to draft' : 'Saved live'}
            </span>
          )}
          {status === 'error' && <span className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>Failed to save</span>}
          <button
            onClick={save}
            disabled={isPending}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
            style={{ background: 'var(--violet)' }}
          >
            {isPending ? 'Saving…' : hasDraft ? 'Save correction' : 'Save'}
          </button>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Description</span>
          <textarea
            value={companyInfo.description}
            onChange={e => setCompanyInfo(c => ({ ...c, description: e.target.value }))}
            rows={3}
            className="w-full rounded-xl p-3 text-sm"
            style={{ border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Website</span>
          <input
            value={companyInfo.website}
            onChange={e => setCompanyInfo(c => ({ ...c, website: e.target.value }))}
            className="w-full text-sm rounded-xl px-3 py-2"
            style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Street address</span>
          <input
            value={companyInfo.address}
            onChange={e => setCompanyInfo(c => ({ ...c, address: e.target.value }))}
            className="w-full text-sm rounded-xl px-3 py-2"
            style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>City</span>
            <input
              value={companyInfo.city}
              onChange={e => setCompanyInfo(c => ({ ...c, city: e.target.value }))}
              className="w-full text-sm rounded-xl px-3 py-2"
              style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>State</span>
            <select
              value={companyInfo.state}
              onChange={e => setCompanyInfo(c => ({ ...c, state: e.target.value }))}
              className="w-full text-sm rounded-xl px-3 py-2"
              style={{ border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--bg3)' }}
            >
              <option value="">—</option>
              {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Postcode</span>
            <input
              value={companyInfo.postcode}
              onChange={e => setCompanyInfo(c => ({ ...c, postcode: e.target.value }))}
              className="w-full text-sm rounded-xl px-3 py-2"
              style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>Google Maps link</span>
          <input
            value={companyInfo.googleMapsUrl}
            onChange={e => setCompanyInfo(c => ({ ...c, googleMapsUrl: e.target.value }))}
            className="w-full text-sm rounded-xl px-3 py-2"
            style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
      </div>
    </section>
  )
}
