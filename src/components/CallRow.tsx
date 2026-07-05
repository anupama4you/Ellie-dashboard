import Link from 'next/link'
import { PhoneIncoming, PhoneOutgoing, Globe, PhoneOff, FileText } from 'lucide-react'
import WaveformPlayer from './WaveformPlayer'

const COLS = '32px 1fr 160px 80px 140px 40px'

function TypeIcon({ type }: { type?: string }) {
  if (type === 'outboundPhoneCall') return <PhoneOutgoing size={13} style={{ color: 'var(--violet)' }} />
  if (type === 'webCall')           return <Globe         size={13} style={{ color: 'var(--violet)' }} />
  if (type === 'inboundPhoneCall')  return <PhoneIncoming size={13} style={{ color: 'var(--signal)' }} />
  return <PhoneOff size={13} style={{ color: 'var(--t3)' }} />
}

function typeBg(type?: string): string {
  if (type === 'outboundPhoneCall') return 'rgba(109,74,255,0.1)'
  if (type === 'webCall')           return 'rgba(109,74,255,0.1)'
  return 'rgba(15,163,122,0.1)'
}

function typeBorder(type?: string): string {
  if (type === 'outboundPhoneCall') return 'rgba(109,74,255,0.2)'
  if (type === 'webCall')           return 'rgba(109,74,255,0.2)'
  return 'rgba(15,163,122,0.2)'
}

function typeAccent(type?: string): string {
  if (type === 'outboundPhoneCall') return 'var(--violet)'
  if (type === 'webCall')           return 'var(--violet)'
  return 'var(--signal)'
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
  return (
    <div className="relative call-row" style={{ borderBottom: '1px solid var(--b4)' }}>
      {/* Hover accent bar */}
      <div
        className="call-row-accent absolute left-0 top-0 bottom-0 w-0.5 rounded-r transition-opacity"
        style={{ background: typeAccent(type) }}
        aria-hidden
      />

      {/* Main row */}
      <div
        className="grid items-center px-5 gap-4 hover-row transition-colors"
        style={{ gridTemplateColumns: COLS, paddingTop, paddingBottom }}
      >
        {/* Type icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: typeBg(type),
            border: `1px solid ${typeBorder(type)}`,
          }}
        >
          <TypeIcon type={type} />
        </div>

        {/* Caller + summary / recording */}
        <div className="min-w-0 flex items-center gap-3">
          {customerNumber && (
            <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: 'var(--text)' }}>
              {customerNumber}
            </span>
          )}
          {recordingUrl ? (
            <WaveformPlayer src={recordingUrl} compact />
          ) : !customerNumber ? (
            <span className="text-sm" style={{ color: 'var(--t5)' }}>—</span>
          ) : null}
          {summary && (
            <span
              className={`text-xs truncate leading-relaxed ${recordingUrl ? 'shrink-0' : 'flex-1 min-w-0'}`}
              style={{ color: 'var(--t4)', maxWidth: recordingUrl ? 180 : undefined }}
              title={summary}
            >
              {summary}
            </span>
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
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full w-fit"
          style={{ background: badgeBg, color: badgeColor }}
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: badgeColor }} aria-hidden />
          {badgeLabel}
        </span>

        {/* Actions */}
        {hasTranscript ? (
          <Link
            href={`/calls/${id}`}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors btn-ghost focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: 'rgba(139,133,160,0.07)',
              border: '1px solid rgba(139,133,160,0.12)',
              color: 'var(--t3)',
              outlineColor: 'var(--t3)',
            }}
            title="View transcript"
            aria-label="View transcript"
          >
            <FileText size={12} />
          </Link>
        ) : <span className="w-8" />}
      </div>
    </div>
  )
}
