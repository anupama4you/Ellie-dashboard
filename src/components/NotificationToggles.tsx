'use client'

import { useState, useTransition } from 'react'
import { updateNotificationPrefs, type NotificationPrefs } from '@/app/(dashboard)/settings/actions'

const ROWS: { key: keyof NotificationPrefs; title: string; desc: string }[] = [
  { key: 'bookingTexts', title: 'Text me after every booking', desc: 'A short SMS with who, what and when' },
  { key: 'morningBrief',  title: 'Morning brief at 8:00 AM',    desc: 'A summary of everything Ellie handled overnight' },
  { key: 'urgentAlerts',  title: 'Alert me for urgent calls',   desc: 'Complaints or anything Ellie flags as needing you' },
  { key: 'weeklyReport',  title: 'Weekly report email',         desc: 'Calls, bookings and revenue, every Monday' },
]

export default function NotificationToggles({ businessId, initialPrefs }: { businessId: string; initialPrefs: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initialPrefs)
  const [, startTransition] = useTransition()

  function toggle(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    startTransition(() => {
      updateNotificationPrefs(businessId, next).catch(() => setPrefs(prefs))
    })
  }

  return (
    <>
      {ROWS.map((row, i) => (
        <div
          key={row.key}
          className="flex items-center gap-3.5 px-5 py-3.5"
          style={{ borderTop: i > 0 ? '1px solid var(--line)' : undefined }}
        >
          <div className="flex-1">
            <b className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{row.title}</b>
            <span className="block text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{row.desc}</span>
          </div>
          <button
            onClick={() => toggle(row.key)}
            role="switch"
            aria-checked={prefs[row.key]}
            aria-label={row.title}
            className="w-[38px] h-[22px] rounded-full relative shrink-0 transition-colors"
            style={{ background: prefs[row.key] ? 'var(--signal)' : 'var(--line)' }}
          >
            <span
              className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all"
              style={{ left: prefs[row.key] ? 19 : 3, boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}
            />
          </button>
        </div>
      ))}
    </>
  )
}
