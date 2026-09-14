'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ServiceDraft } from '@/lib/promptSections'

type ServiceRow = { id?: string; name: string; durationMinutes: number | null; price: string }
const PRICE_INPUT_RE = /^\d*\.?\d{0,2}$/

function toServiceRow(s: ServiceDraft): ServiceRow {
  return { id: s.id, name: s.name, durationMinutes: s.durationMinutes, price: s.priceCents != null ? (s.priceCents / 100).toFixed(2) : '' }
}
function toServiceDraft(r: ServiceRow): ServiceDraft {
  const n = parseFloat(r.price)
  return { id: r.id, name: r.name, durationMinutes: r.durationMinutes, priceCents: isNaN(n) ? null : Math.round(n * 100) }
}

type Props = { title?: string; services: ServiceDraft[]; onChange: (next: ServiceDraft[]) => void }

export default function ServicesSectionField({ title = 'Services', services, onChange }: Props) {
  const [rows, setRows] = useState<ServiceRow[]>(services.map(toServiceRow))

  function update(next: ServiceRow[]) {
    setRows(next)
    onChange(next.map(toServiceDraft))
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
        <button
          onClick={() => update([...rows, { name: '', durationMinutes: 30, price: '' }])}
          className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--violet)' }}>
          <Plus size={13} /> Add service
        </button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 px-5 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
          <input value={r.name} onChange={e => update(rows.map((row, j) => j === i ? { ...row, name: e.target.value } : row))}
            placeholder="Service name" className="flex-1 rounded-lg px-2.5 py-1.5 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
          <input type="number" value={r.durationMinutes ?? ''} onChange={e => update(rows.map((row, j) => j === i ? { ...row, durationMinutes: e.target.value ? Number(e.target.value) : null } : row))}
            placeholder="Min" className="w-16 rounded-lg px-2 py-1.5 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
          <input value={r.price} onChange={e => { if (PRICE_INPUT_RE.test(e.target.value)) update(rows.map((row, j) => j === i ? { ...row, price: e.target.value } : row)) }}
            placeholder="0.00" className="w-20 rounded-lg px-2 py-1.5 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
          <button onClick={() => update(rows.filter((_, j) => j !== i))} style={{ color: 'var(--coral)' }}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  )
}
