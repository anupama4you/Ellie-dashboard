'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import DateRangePicker from '@/components/DateRangePicker'

const OUTCOMES = [
  { value: '',          label: 'All outcomes' },
  { value: 'answered',  label: 'Answered'     },
  { value: 'booked',    label: 'Booked'       },
  { value: 'missed',    label: 'Missed'       },
  { value: 'voicemail', label: 'Voicemail'    },
]

const QUICK = [
  { label: 'Today',   days: 1  },
  { label: '7 days',  days: 7  },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

export default function CallsFilter() {
  const router = useRouter()
  const sp     = useSearchParams()

  const from    = sp.get('from')    ?? ''
  const to      = sp.get('to')      ?? ''
  const outcome = sp.get('outcome') ?? ''

  function update(patches: Record<string, string>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patches)) {
      if (v) next.set(k, v)
      else   next.delete(k)
    }
    next.delete('page')
    router.push(`/calls?${next}`)
  }

  function rangeFor(days: number) {
    const today = new Date()
    const toStr = today.toISOString().slice(0, 10)
    const start = new Date(today)
    start.setDate(start.getDate() - (days - 1))
    return { from: start.toISOString().slice(0, 10), to: toStr }
  }

  function quickRange(days: number) {
    update(rangeFor(days))
  }

  const activeQuickDays = QUICK.find(q => {
    const r = rangeFor(q.days)
    return r.from === from && r.to === to
  })?.days

  const hasFilters = from || to || outcome

  return (
    <div className="flex items-center gap-2 flex-wrap">

      {/* Quick presets */}
      {QUICK.map(q => {
        const active = q.days === activeQuickDays
        return (
          <button key={q.label}
            onClick={() => quickRange(q.days)}
            aria-pressed={active}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${active ? '' : 'btn-ghost'}`}
            style={{
              color:      active ? 'var(--text)' : 'var(--t3)',
              border:     `1px solid ${active ? 'rgba(109,74,255,0.35)' : 'var(--border)'}`,
              background: active ? 'rgba(109,74,255,0.12)' : undefined,
            }}>
            {q.label}
          </button>
        )
      })}

      <div className="w-px h-4 shrink-0" style={{ background: 'var(--border)' }} />

      {/* Calendar date range picker */}
      <DateRangePicker
        from={from}
        to={to}
        onChange={(f, t) => update({ from: f, to: t })}
      />

      <div className="w-px h-4 shrink-0" style={{ background: 'var(--border)' }} />

      {/* Outcome */}
      <select
        value={outcome}
        onChange={e => update({ outcome: e.target.value })}
        className="admin-input admin-select"
        style={{
          width: 148,
          padding: '5px 10px',
          fontSize: 13,
          borderColor: outcome ? 'rgba(109,74,255,0.35)' : undefined,
          background: outcome ? 'rgba(109,74,255,0.08)' : undefined,
          color: outcome ? 'var(--text)' : undefined,
        }}>
        {OUTCOMES.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={() => update({ from: '', to: '', outcome: '' })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors btn-ghost"
          style={{ color: 'var(--t3)' }}>
          <X size={12} />
          Clear all
        </button>
      )}
    </div>
  )
}
