'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PhoneIncoming, PhoneOutgoing, Globe, PhoneOff, Play, Pause, FileText } from 'lucide-react'

const COLS = '32px 1fr 160px 80px 140px 76px'

function TypeIcon({ type }: { type?: string }) {
  if (type === 'outboundPhoneCall') return <PhoneOutgoing size={13} style={{ color: '#60a5fa' }} />
  if (type === 'webCall')           return <Globe         size={13} style={{ color: '#a78bfa' }} />
  if (type === 'inboundPhoneCall')  return <PhoneIncoming size={13} style={{ color: '#34d399' }} />
  return <PhoneOff size={13} style={{ color: 'var(--t3)' }} />
}

function typeBg(type?: string): string {
  if (type === 'outboundPhoneCall') return 'rgba(96,165,250,0.1)'
  if (type === 'webCall')           return 'rgba(167,139,250,0.1)'
  return 'rgba(52,211,153,0.1)'
}

function typeBorder(type?: string): string {
  if (type === 'outboundPhoneCall') return 'rgba(96,165,250,0.2)'
  if (type === 'webCall')           return 'rgba(167,139,250,0.2)'
  return 'rgba(52,211,153,0.2)'
}

export type CallRowProps = {
  id: string
  type?: string
  customerNumber?: string
  startedDate?: string
  startedTime?: string
  duration: number
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  summary?: string
  recordingUrl?: string
  hasTranscript: boolean
  paddingTop: string
  paddingBottom: string
}

function fmtDuration(secs: number) {
  if (!secs || !isFinite(secs) || secs <= 0) return '—'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export default function CallRow({
  id, type, customerNumber, startedDate, startedTime,
  duration, badgeLabel, badgeColor, badgeBg,
  summary, recordingUrl, hasTranscript, paddingTop, paddingBottom,
}: CallRowProps) {
  const [audioOpen, setAudioOpen] = useState(false)

  return (
    <div style={{ borderBottom: '1px solid var(--b4)' }}>
      {/* Main row */}
      <div
        className="grid items-center px-5 gap-4 hover-row transition-colors"
        style={{ gridTemplateColumns: COLS, paddingTop, paddingBottom }}
      >
        {/* Type icon */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background: typeBg(type),
            border: `1px solid ${typeBorder(type)}`,
          }}
        >
          <TypeIcon type={type} />
        </div>

        {/* Caller + summary */}
        <div className="min-w-0">
          <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
            {customerNumber ?? '—'}
          </div>
          {summary && (
            <div
              className="text-xs truncate mt-0.5 leading-relaxed"
              style={{ color: 'var(--t4)' }}
              title={summary}
            >
              {summary}
            </div>
          )}
        </div>

        {/* Date / time */}
        <div>
          {startedDate ? (
            <>
              <div className="text-sm font-medium" style={{ color: 'var(--t2)' }}>{startedDate}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--t4)' }}>{startedTime}</div>
            </>
          ) : (
            <span style={{ color: 'var(--t5)' }}>—</span>
          )}
        </div>

        {/* Duration */}
        <span
          className="text-sm font-medium tabular-nums"
          style={{ color: duration > 0 ? 'var(--t2)' : 'var(--t5)' }}
        >
          {fmtDuration(duration)}
        </span>

        {/* Outcome badge */}
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full w-fit"
          style={{ background: badgeBg, color: badgeColor }}
        >
          {badgeLabel}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {recordingUrl ? (
            <button
              onClick={() => setAudioOpen(o => !o)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: audioOpen ? 'rgba(167,139,250,0.2)' : 'rgba(167,139,250,0.08)',
                border: `1px solid ${audioOpen ? 'rgba(167,139,250,0.3)' : 'rgba(167,139,250,0.15)'}`,
                color: '#a78bfa',
              }}
              title={audioOpen ? 'Close player' : 'Play recording'}
            >
              {audioOpen
                ? <Pause size={11} />
                : <Play  size={11} />}
            </button>
          ) : <span className="w-7" />}

          {hasTranscript ? (
            <Link
              href={`/calls/${id}`}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors btn-ghost"
              style={{
                background: 'rgba(100,116,139,0.07)',
                border: '1px solid rgba(100,116,139,0.12)',
                color: 'var(--t3)',
              }}
              title="View transcript"
            >
              <FileText size={11} />
            </Link>
          ) : <span className="w-7" />}
        </div>
      </div>

      {/* Inline audio player */}
      {audioOpen && recordingUrl && (
        <div className="px-5 pb-3.5 pt-1">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls autoPlay className="w-full" style={{ height: 36 }}>
            <source src={recordingUrl} />
          </audio>
        </div>
      )}
    </div>
  )
}
