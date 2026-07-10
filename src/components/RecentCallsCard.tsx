'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AudioWaveform, FileText, Clock3 } from 'lucide-react'
import { initials, avatarColor } from '@/lib/avatar'

export type RecentCallCategory = 'booked' | 'rebooked' | 'enquiry' | 'transferred' | 'missed' | 'errored'

export type RecentCallItem = {
  id: string
  displayName: string
  subLabel?: string
  summary: string
  category: RecentCallCategory
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  isAfterHours: boolean
  timeLabel: string
  durationLabel: string
  recordingUrl?: string
  hasTranscript: boolean
}

const FILTERS: { key: 'all' | RecentCallCategory; label: string }[] = [
  { key: 'all',         label: 'All'         },
  { key: 'booked',      label: 'Booked'      },
  { key: 'rebooked',    label: 'Rebooked'    },
  { key: 'enquiry',     label: 'Enquiries'   },
  { key: 'transferred', label: 'Transferred' },
  { key: 'missed',      label: 'Missed'      },
]

/** `missed`/`errored` are folded into one "Missed" filter pill — both mean the call didn't reach a useful outcome — but each row still shows its true badge (Missed vs Error). */
function matchesFilter(category: RecentCallCategory, filter: 'all' | RecentCallCategory): boolean {
  if (filter === 'all') return true
  if (filter === 'missed') return category === 'missed' || category === 'errored'
  return category === filter
}

export default function RecentCallsCard({ calls }: { calls: RecentCallItem[] }) {
  const [filter, setFilter] = useState<'all' | RecentCallCategory>('all')

  const counts: Record<'all' | RecentCallCategory, number> = {
    all: calls.length,
    booked: 0, rebooked: 0, enquiry: 0, transferred: 0, missed: 0, errored: 0,
  }
  for (const c of calls) {
    counts[c.category]++
    if (c.category === 'errored') counts.missed++
  }

  const visible = calls.filter(c => matchesFilter(c.category, filter)).slice(0, 8)

  return (
    <>
      <div className="flex items-center gap-2 px-5 pb-3 flex-wrap">
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
              style={{
                background: active ? 'var(--ink)' : 'var(--paper)',
                color: active ? '#fff' : 'var(--ink-2)',
                border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
              }}
            >
              {f.label}
              <span style={{ opacity: 0.65 }}>{counts[f.key]}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col">
        {visible.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No calls in this category</p>
          </div>
        ) : (
          visible.map((c, i) => {
            const avatar = avatarColor(c.displayName)
            return (
            <div key={c.id} className="flex items-center gap-3 px-5 py-3.5"
              style={{ borderTop: i > 0 ? '1px solid var(--line)' : undefined }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: avatar.bg, color: avatar.color }}>
                {initials(c.displayName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{c.displayName}</p>
                  {c.isAfterHours && (
                    <span title="Outside business hours">
                      <Clock3 size={11} style={{ color: 'var(--t5)' }} />
                    </span>
                  )}
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{c.summary}</p>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <p className="text-xs font-mono" style={{ color: 'var(--ink-3)' }}>{c.timeLabel}</p>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--ink-3)' }}>{c.durationLabel}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap"
                style={{ color: c.badgeColor, background: c.badgeBg }}>
                {c.badgeLabel}
              </span>
              {c.recordingUrl || c.hasTranscript ? (
                <Link href={`/calls/${c.id}`}
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 btn-ghost"
                  style={{ color: 'var(--t4)' }}
                  title={c.recordingUrl ? 'Play recording' : 'View transcript'}>
                  {c.recordingUrl ? <AudioWaveform size={13} /> : <FileText size={13} />}
                </Link>
              ) : (
                <div className="w-7 h-7 shrink-0" />
              )}
            </div>
            )
          })
        )}
      </div>
    </>
  )
}
