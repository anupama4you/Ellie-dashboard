'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Play, Pause, FileText, PhoneMissed } from 'lucide-react'

type Props = {
  id: string
  time: string
  summary?: string
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  badgeBorder: string
  recordingUrl?: string
  hasTranscript?: boolean
  isMissed?: boolean
  customerNumber?: string
}

export default function TodayCallRow({
  id, time, summary, badgeLabel, badgeColor, badgeBg, badgeBorder,
  recordingUrl, hasTranscript, isMissed, customerNumber,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--bg3)',
        border: `1px solid ${isMissed ? 'rgba(248,113,113,0.18)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-start gap-4 px-4 py-3.5">
        {/* Left: time + accent stripe */}
        <div className="flex flex-col items-center gap-1.5 shrink-0 pt-0.5">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: badgeColor }}
          />
          <span
            className="text-xs font-mono font-semibold tabular-nums"
            style={{ color: 'var(--t4)', writingMode: 'horizontal-tb' }}
          >
            {time}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isMissed ? (
            <div className="flex items-center gap-2">
              <PhoneMissed size={13} style={{ color: '#f87171', flexShrink: 0 }} />
              <p className="text-sm font-medium" style={{ color: '#f87171' }}>
                Missed call{customerNumber ? ` from ${customerNumber}` : ''}
              </p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--t2)' }}>
              {summary || 'No summary available'}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1.5">
            {isMissed && customerNumber && (
              <span className="text-xs" style={{ color: 'var(--t4)' }}>
                Follow up:{' '}
                <span className="font-medium" style={{ color: '#a78bfa' }}>{customerNumber}</span>
              </span>
            )}
            {hasTranscript && !isMissed && (
              <Link
                href={`/calls/${id}`}
                className="inline-flex items-center gap-1 text-xs transition-colors hover:text-violet-400"
                style={{ color: 'var(--t5)' }}
              >
                <FileText size={10} />
                View transcript
              </Link>
            )}
          </div>
        </div>

        {/* Right: badge + play button */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <span
            className="text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap"
            style={{ color: badgeColor, background: badgeBg, border: `1px solid ${badgeBorder}` }}
          >
            {badgeLabel}
          </span>
          {recordingUrl && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all btn-ghost"
              style={{
                color: expanded ? '#a78bfa' : 'var(--t4)',
                background: expanded ? 'rgba(167,139,250,0.12)' : undefined,
                border: expanded ? '1px solid rgba(167,139,250,0.2)' : '1px solid transparent',
              }}
              title={expanded ? 'Close player' : 'Play recording'}
            >
              {expanded ? <Pause size={12} /> : <Play size={12} />}
            </button>
          )}
        </div>
      </div>

      {expanded && recordingUrl && (
        <div className="px-4 pb-3.5" style={{ borderTop: '1px solid var(--b3)' }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls autoPlay src={recordingUrl} className="w-full mt-3" style={{ height: 36 }} />
        </div>
      )}
    </div>
  )
}
