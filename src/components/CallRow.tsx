import { Globe, PhoneIncoming, PhoneOutgoing, Phone, AlertTriangle, ChevronDown } from 'lucide-react'
import PlayButton from './PlayButton'

export const ROW_COLUMNS = '80px 200px 150px 120px 1fr 130px 60px 24px 40px'

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
  type, typeLabel, assistantNumber, customerNumber, customerName,
  startedDate, startedTime, durationSecs, category, badgeLabel, badgeColor, badgeBg,
  recordingUrl, hasTranscript, isExpanded, onToggle,
}: CallRowProps & { isExpanded: boolean; onToggle: () => void }) {
  const errored   = category === 'errored'
  const clickable = hasTranscript

  return (
    <div
      onClick={clickable ? onToggle : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-expanded={clickable ? isExpanded : undefined}
      className={`grid items-center gap-3 px-5 py-3 transition-colors w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${clickable ? 'hover-row cursor-pointer' : ''}`}
      style={{
        gridTemplateColumns: ROW_COLUMNS,
        background: isExpanded ? 'var(--paper)' : errored ? 'rgba(221,81,64,0.04)' : undefined,
        borderTop: '1px solid var(--line)',
        outlineColor: 'var(--violet)',
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

      <span />

      <div className="font-mono text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        {startedDate ? (<>{startedDate}<br />{startedTime}</>) : '—'}
      </div>

      <span className="font-mono text-xs" style={{ color: 'var(--ink-3)' }}>{fmtDuration(durationSecs)}</span>

      {clickable ? (
        <ChevronDown
          size={14}
          style={{ color: 'var(--ink-3)', transform: isExpanded ? 'rotate(180deg)' : undefined, transition: 'transform 150ms ease' }}
        />
      ) : <span />}

      {recordingUrl ? <PlayButton src={recordingUrl} /> : <span className="w-8 h-8" />}
    </div>
  )
}
