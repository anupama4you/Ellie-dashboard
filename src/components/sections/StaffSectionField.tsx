'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Hours, StaffDraft } from '@/lib/promptSections'
import HoursSectionField from './HoursSectionField'

type Props = { title?: string; staff: StaffDraft[]; businessHours: Hours; onChange: (next: StaffDraft[]) => void }

export default function StaffSectionField({ title = 'Team', staff, businessHours, onChange }: Props) {
  const [rows, setRows] = useState<StaffDraft[]>(staff)

  function update(next: StaffDraft[]) {
    setRows(next)
    onChange(next)
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
        <button onClick={() => update([...rows, { name: '', active: true, hours: null }])}
          className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--violet)' }}>
          <Plus size={13} /> Add team member
        </button>
      </div>
      {rows.map((s, i) => (
        <div key={i} className="flex flex-col gap-2 px-5 py-3" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
          <div className="flex items-center gap-2">
            <input value={s.name} onChange={e => update(rows.map((row, j) => j === i ? { ...row, name: e.target.value } : row))}
              placeholder="Name" className="flex-1 rounded-lg px-2.5 py-1.5 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--t3)' }}>
              <input type="checkbox" checked={s.active} onChange={e => update(rows.map((row, j) => j === i ? { ...row, active: e.target.checked } : row))} />
              Active
            </label>
            <button onClick={() => update(rows.filter((_, j) => j !== i))} style={{ color: 'var(--coral)' }}><Trash2 size={14} /></button>
          </div>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--t3)' }}>
            <input type="checkbox" checked={s.hours !== null}
              onChange={e => update(rows.map((row, j) => j === i ? { ...row, hours: e.target.checked ? businessHours : null } : row))} />
            Custom hours (different from the business's regular hours)
          </label>
          {s.hours && (
            <HoursSectionField title={`${s.name || 'This team member'}'s hours`} hours={s.hours}
              onChange={next => update(rows.map((row, j) => j === i ? { ...row, hours: next } : row))} />
          )}
        </div>
      ))}
    </div>
  )
}
