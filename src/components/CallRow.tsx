import { AlertTriangle, ChevronDown, Clock3 } from 'lucide-react'
import PlayButton from './PlayButton'
import { initials, avatarColor } from '@/lib/avatar'

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
  category: 'booked' | 'rebooked' | 'transferred' | 'missed' | 'enquiry' | 'errored'
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  isAfterHours?: boolean
  recordingUrl?: string
  hasTranscript: boolean
}

export default function CallRow({
  customerNumber, customerName,
  startedTime, durationSecs, summary, category, badgeLabel, badgeColor, badgeBg,
  isAfterHours, recordingUrl, hasTranscript, isExpanded, onToggle,
}: CallRowProps & { isExpanded: boolean; onToggle: () => void }) {
  const errored     = category === 'errored'
  const clickable   = hasTranscript
  const displayName = customerName?.trim() || customerNumber || 'Unknown caller'
  const avatar      = avatarColor(displayName)

  return (
    <div
      onClick={clickable ? onToggle : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-expanded={clickable ? isExpanded : undefined}
      className={`flex items-center gap-3 px-5 py-3.5 transition-colors w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${clickable ? 'hover-row cursor-pointer' : ''}`}
      style={{
        background: isExpanded ? 'var(--paper)' : errored ? 'rgba(221,81,64,0.04)' : undefined,
        borderTop: '1px solid var(--line)',
        outlineColor: 'var(--violet)',
      }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: avatar.bg, color: avatar.color }}>
        {initials(displayName)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate" style={{ color: errored ? 'var(--ink-3)' : 'var(--ink)' }}>
            {displayName}
          </p>
          {isAfterHours && (
            <span title="Outside business hours">
              <Clock3 size={11} style={{ color: 'var(--ink-3)' }} />
            </span>
          )}
        </div>
        {customerName && customerNumber && (
          <p className="text-xs truncate mt-0.5 font-mono" style={{ color: 'var(--ink-3)' }}>{customerNumber}</p>
        )}
        {summary && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{summary}</p>
        )}
      </div>

      <div className="text-right shrink-0 hidden sm:block">
        <p className="text-xs font-mono" style={{ color: 'var(--ink-3)' }}>{startedTime}</p>
        <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--ink-3)' }}>{fmtDuration(durationSecs)}</p>
      </div>

      <span
        className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap w-fit flex items-center gap-1 shrink-0"
        style={{ color: badgeColor, background: badgeBg }}
      >
        {errored && <AlertTriangle size={11} />}
        {badgeLabel}
      </span>

      {clickable ? (
        <ChevronDown
          size={14}
          className="shrink-0"
          style={{ color: 'var(--ink-3)', transform: isExpanded ? 'rotate(180deg)' : undefined, transition: 'transform 150ms ease' }}
        />
      ) : <span className="w-3.5 shrink-0" />}

      {recordingUrl ? <PlayButton src={recordingUrl} /> : <span className="w-8 h-8 shrink-0" />}
    </div>
  )
}
