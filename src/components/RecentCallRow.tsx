'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Play, Pause } from 'lucide-react'

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #a78bfa, #7c3aed)',
  'linear-gradient(135deg, #f472b6, #db2777)',
  'linear-gradient(135deg, #34d399, #059669)',
  'linear-gradient(135deg, #60a5fa, #2563eb)',
  'linear-gradient(135deg, #fbbf24, #d97706)',
  'linear-gradient(135deg, #818cf8, #4338ca)',
  'linear-gradient(135deg, #2dd4bf, #0d9488)',
  'linear-gradient(135deg, #fb923c, #ea580c)',
]

function avatarGradient(key: string) {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}

function avatarInitials(number?: string, name?: string) {
  if (name) return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  if (number) {
    const digits = number.replace(/\D/g, '')
    const local = digits.startsWith('61') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits
    return local.slice(0, 2)
  }
  return '??'
}

export type RecentCallRowProps = {
  id: string
  customerNumber?: string
  customerName?: string
  summary?: string
  relativeTime: string
  duration: string
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  badgeBorder: string
  recordingUrl?: string
  hasTranscript: boolean
}

export default function RecentCallRow({
  id, customerNumber, customerName, summary, relativeTime,
  duration, badgeLabel, badgeColor, badgeBg, badgeBorder,
  recordingUrl, hasTranscript,
}: RecentCallRowProps) {
  const [audioOpen, setAudioOpen] = useState(false)
  const key      = customerNumber ?? customerName ?? id
  const initials = avatarInitials(customerNumber, customerName)
  const gradient = avatarGradient(key)
  const displayName = customerName ?? customerNumber ?? 'Unknown caller'

  return (
    <div style={{ borderBottom: '1px solid var(--b4)' }}>
      <div className="flex items-center px-6 py-4 gap-4 transition-colors cursor-default"
        style={{ ['--tw-bg-opacity' as string]: '1' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hov)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}>

        {/* Avatar */}
        <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white select-none"
          style={{ background: gradient }}>
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{displayName}</div>
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--t5)' }}>
            {summary
              ? <>{summary} <span style={{ color: 'var(--t6)' }}>·</span> {relativeTime}</>
              : relativeTime}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm tabular-nums" style={{ color: 'var(--t5)' }}>{duration}</span>

          <span className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide"
            style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>
            {badgeLabel}
          </span>

          {/* Play / transcript button */}
          {recordingUrl ? (
            <button
              onClick={() => setAudioOpen(o => !o)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{
                background: audioOpen ? 'rgba(167,139,250,0.25)' : 'rgba(167,139,250,0.12)',
                border: '1px solid rgba(167,139,250,0.3)',
              }}>
              {audioOpen
                ? <Pause size={12} style={{ color: '#a78bfa' }} />
                : <Play  size={12} style={{ color: '#a78bfa', marginLeft: 1 }} />}
            </button>
          ) : hasTranscript ? (
            <Link href={`/calls/${id}`}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-violet-500/20"
              style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
              <Play size={12} style={{ color: '#a78bfa', marginLeft: 1 }} />
            </Link>
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'var(--b5)', border: '1px solid var(--b2)' }}>
              <Play size={12} style={{ color: 'var(--t6)', marginLeft: 1 }} />
            </div>
          )}
        </div>
      </div>

      {/* Inline audio player */}
      {audioOpen && recordingUrl && (
        <div className="px-6 pb-4 pl-[4.25rem]">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls autoPlay className="w-full" style={{ height: 36 }}>
            <source src={recordingUrl} />
          </audio>
        </div>
      )}
    </div>
  )
}
