'use client'

import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

export default function AnalyticsRangeSelect({ range }: { range: string }) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-1.5 rounded-xl px-3 py-1" style={{ border: '1px solid var(--line)', background: 'var(--card)' }}>
      <ChevronDown size={13} style={{ color: 'var(--ink-3)' }} />
      <select
        value={range}
        onChange={e => router.push(`/analytics?range=${e.target.value}`)}
        className="bg-transparent text-sm font-semibold py-1.5 outline-none"
        style={{ color: 'var(--ink-2)' }}
      >
        {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
