import Link from 'next/link'
import { Globe, PhoneIncoming, PhoneOutgoing, Phone, AlertTriangle } from 'lucide-react'
import PlayButton from './PlayButton'

export const ROW_COLUMNS = '90px 1fr 140px 110px 150px 70px 40px'

function TypeIcon({ type }: { type?: string }) {
  if (type === 'webCall') return <Globe size={12} />
  if (type === 'outboundPhoneCall') return <PhoneOutgoing size={12} />
  if (type === 'inboundPhoneCall') return <PhoneIncoming size={12} />
  return <Phone size={12} />
}

function fmtDuration(secs: number) {
  if (!secs || !isFinite(secs) || secs <= 0) return '—'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export type CallRowProps = {
  id: string
  type?: string
  typeLabel: string
  assistantNumber?: string
  customerNumber?: string
  customerName?: string
  startedAtIso?: string
  startedDate?: string
  startedTime?: string
  durationSecs: number
  summary?: string
  category: 'booked' | 'transferred' | 'missed' | 'enquiry' | 'errored'
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  recordingUrl?: string
  hasTranscript: boolean
}

export default function CallRow({
  id, type, typeLabel, assistantNumber, customerNumber, customerName,
  startedDate, startedTime, durationSecs, category, badgeLabel, badgeColor, badgeBg,
  recordingUrl, hasTranscript,
}: CallRowProps) {
  const errored   = category === 'errored'
  const clickable = hasTranscript && !errored

  const content = (
    <div
      className={`grid items-center gap-3 px-5 py-3 transition-colors ${clickable ? 'hover-row' : ''}`}
      style={{
        gridTemplateColumns: ROW_COLUMNS,
        background: errored ? 'rgba(221,81,64,0.04)' : undefined,
        cursor: errored ? 'not-allowed' : undefined,
      }}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
        <TypeIcon type={type} /> {typeLabel}
      </span>

      <div className="min-w-0">
        <b className="block text-sm font-semibold truncate" style={{ color: errored ? 'var(--ink-3)' : 'var(--ink)' }}>
          {customerNumber || customerName || '—'}
        </b>
        {customerName && customerNumber && (
          <span className="block text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{customerName}</span>
        )}
      </div>

      <span className="text-xs font-mono truncate" style={{ color: 'var(--ink-3)' }}>{assistantNumber || '—'}</span>

      <span
        className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap w-fit flex items-center gap-1"
        style={{ color: badgeColor, background: badgeBg }}
      >
        {errored && <AlertTriangle size={11} />}
        {badgeLabel}
      </span>

      <div className="font-mono text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        {startedDate ? (<>{startedDate}<br />{startedTime}</>) : '—'}
      </div>

      <span className="font-mono text-xs" style={{ color: 'var(--ink-3)' }}>{fmtDuration(durationSecs)}</span>

      {recordingUrl ? <PlayButton src={recordingUrl} /> : <span className="w-8 h-8" />}
    </div>
  )

  if (clickable) {
    return (
      <Link href={`/calls/${id}`} className="block" style={{ borderTop: '1px solid var(--line)' }}>
        {content}
      </Link>
    )
  }
  return <div style={{ borderTop: '1px solid var(--line)' }}>{content}</div>
}
