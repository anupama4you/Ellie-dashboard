'use client'

import type { Hours } from '@/lib/promptSections'

const DAY_LABELS: { key: keyof Hours; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
]

type Props = { title?: string; hours: Hours; onChange: (next: Hours) => void }

export default function HoursSectionField({ title = 'Hours', hours, onChange }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
      </div>
      {DAY_LABELS.map(({ key, label }, i) => {
        const d = hours[key]
        return (
          <div key={key} className="flex items-center gap-3 px-5 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <b className="w-10 text-sm font-semibold" style={{ color: 'var(--t2)' }}>{label}</b>
            {d.open ? (
              <div className="flex items-center gap-1.5 flex-1 font-mono text-sm" style={{ color: 'var(--text)' }}>
                <input type="time" value={d.opensAt}
                  onChange={e => onChange({ ...hours, [key]: { ...hours[key], opensAt: e.target.value } })}
                  className="rounded-lg px-1.5 py-1" style={{ border: '1px solid var(--border)' }} />
                <span style={{ color: 'var(--t3)' }}>–</span>
                <input type="time" value={d.closesAt}
                  onChange={e => onChange({ ...hours, [key]: { ...hours[key], closesAt: e.target.value } })}
                  className="rounded-lg px-1.5 py-1" style={{ border: '1px solid var(--border)' }} />
              </div>
            ) : (
              <span className="flex-1 text-sm italic" style={{ color: 'var(--t3)' }}>Closed</span>
            )}
            <button
              onClick={() => onChange({ ...hours, [key]: { ...hours[key], open: !hours[key].open } })}
              role="switch" aria-checked={d.open}
              className="w-[38px] h-[22px] rounded-full relative shrink-0"
              style={{ background: d.open ? 'var(--signal)' : 'var(--border)' }}
            >
              <span className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all" style={{ left: d.open ? 19 : 3 }} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
