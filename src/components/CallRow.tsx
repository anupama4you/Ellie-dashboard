import { AlertTriangle, ChevronRight, Clock3, PhoneOutgoing } from 'lucide-react'
import CopyButton from './CopyButton'
import { initials, avatarColor } from '@/lib/avatar'
import type { CallCategory } from '@/lib/callClassify'

function fmtDuration(secs: number) {
  if (!secs || !isFinite(secs) || secs <= 0) return '—'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export type CallRowProps = {
  id: string
  customerNumber?: string
  customerName?: string
  startedAtIso?: string
  startedDate?: string
  startedTime?: string
  durationSecs: number
  category: CallCategory
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  isAfterHours?: boolean
  isOutbound?: boolean
  summaryPreview?: string
}

export default function CallRow({
  customerNumber, customerName,
  startedTime, durationSecs, category, badgeLabel, badgeColor, badgeBg,
  isAfterHours, isOutbound, summaryPreview, active, onSelect,
}: CallRowProps & { active: boolean; onSelect: () => void }) {
  const errored     = category === 'errored'
  const displayName = customerName?.trim() || customerNumber || 'Unknown caller'
  const avatar      = avatarColor(displayName)

  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      className="flex flex-col gap-0.5 px-3 py-2.5 sm:px-5 sm:py-3 transition-colors w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] hover-row cursor-pointer"
      style={{
        background: active ? 'var(--violet-soft)' : errored ? 'rgba(221,81,64,0.04)' : undefined,
        borderTop: '1px solid var(--line)',
        outlineColor: 'var(--violet)',
      }}
    >
      {/* Identity row — the only row competing with the avatar, time and badge
         for width. Number and summary get their own full-width rows below,
         indented to align under the name, so a long AI summary isn't
         squeezed down to a sliver by the badge/timestamp columns. */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: avatar.bg, color: avatar.color }}>
          {initials(displayName)}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate" style={{ color: errored ? 'var(--ink-3)' : 'var(--ink)' }}>
            {displayName}
          </p>
          {isOutbound && (
            <span title="Outbound campaign call" className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ color: 'var(--violet)', background: 'var(--violet-soft)' }}>
              <PhoneOutgoing size={9} /> Outbound
            </span>
          )}
          {isAfterHours && (
            <span title="Outside business hours">
              <Clock3 size={11} style={{ color: 'var(--ink-3)' }} />
            </span>
          )}
          {customerNumber && !customerName && <CopyButton text={customerNumber} />}
        </div>

        <p className="text-xs font-mono text-right shrink-0 hidden sm:block whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
          {startedTime} · {fmtDuration(durationSecs)}
        </p>

        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap w-fit flex items-center gap-1 shrink-0"
          style={{ color: badgeColor, background: badgeBg }}
        >
          {errored && <AlertTriangle size={11} />}
          {badgeLabel}
        </span>

        <ChevronRight size={14} className="shrink-0" style={{ color: active ? 'var(--violet)' : 'var(--ink-3)' }} />
      </div>

      {customerName && customerNumber && (
        <div className="flex items-center gap-1 pl-[46px]">
          <p className="text-xs truncate font-mono" style={{ color: 'var(--ink-3)' }}>{customerNumber}</p>
          <CopyButton text={customerNumber} />
        </div>
      )}
      {summaryPreview && (
        <p className="text-xs leading-snug line-clamp-2 pl-[46px]" style={{ color: 'var(--ink-3)' }}>{summaryPreview}</p>
      )}
    </div>
  )
}
