'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AudioWaveform, FileText, PhoneMissed } from 'lucide-react'
import WaveformPlayer from './WaveformPlayer'

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
        border: `1px solid ${isMissed ? 'rgba(221,81,64,0.18)' : 'var(--border)'}`,
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
            style={{ color: 'var(--t2)', writingMode: 'horizontal-tb' }}
          >
            {time}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isMissed ? (
            <div className="flex items-center gap-2">
              <PhoneMissed size={13} style={{ color: 'var(--coral)', flexShrink: 0 }} />
              <p className="text-sm font-medium" style={{ color: 'var(--coral)' }}>
                Missed call{customerNumber ? ` from ${customerNumber}` : ''}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {customerNumber && (
                <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: 'var(--text)' }}>
                  {customerNumber}
                </span>
              )}
              <p className="text-sm leading-relaxed truncate" style={{ color: 'var(--t2)' }}>
                {summary || 'No summary available'}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 mt-1.5">
            {isMissed && customerNumber && (
              <span className="text-xs" style={{ color: 'var(--t4)' }}>
                Follow up:{' '}
                <span className="font-medium" style={{ color: 'var(--violet)' }}>{customerNumber}</span>
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
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all btn-ghost focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                color: expanded ? 'var(--violet)' : 'var(--t4)',
                background: expanded ? 'rgba(109,74,255,0.12)' : undefined,
                border: expanded ? '1px solid rgba(109,74,255,0.2)' : '1px solid transparent',
                outlineColor: 'var(--violet)',
              }}
              title={expanded ? 'Hide recording' : 'Show recording'}
              aria-label={expanded ? 'Hide recording' : 'Show recording'}
              aria-pressed={expanded}
            >
              <AudioWaveform size={13} />
            </button>
          )}
        </div>
      </div>

      {expanded && recordingUrl && (
        <div className="px-4 pb-3.5 pt-3" style={{ borderTop: '1px solid var(--b3)' }}>
          <WaveformPlayer src={recordingUrl} />
        </div>
      )}
    </div>
  )
}
