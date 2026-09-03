import { initials, avatarColor } from '@/lib/avatar'

export type SmsThreadRowProps = {
  displayPhone: string
  name: string | null
  lastMessageBody: string
  lastMessageDirection: 'inbound' | 'outbound'
  lastMessageTimeLabel: string
}

export default function SmsThreadRow({
  displayPhone, name, lastMessageBody, lastMessageDirection, lastMessageTimeLabel, active, onSelect,
}: SmsThreadRowProps & { active: boolean; onSelect: () => void }) {
  const displayName = name?.trim() || displayPhone
  const avatar = avatarColor(displayName)

  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      className="flex items-center gap-2.5 sm:gap-3 px-3 py-3 sm:px-5 sm:py-3.5 transition-colors w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] hover-row cursor-pointer"
      style={{
        background: active ? 'var(--violet-soft)' : undefined,
        borderTop: '1px solid var(--line)',
        outlineColor: 'var(--violet)',
      }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: avatar.bg, color: avatar.color }}>
        {initials(displayName)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{displayName}</p>
          <span className="text-[11px] font-mono shrink-0" style={{ color: 'var(--ink-3)' }}>{lastMessageTimeLabel}</span>
        </div>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {lastMessageDirection === 'outbound' && <span style={{ color: 'var(--ink-4, var(--ink-3))' }}>You: </span>}
          {lastMessageBody || '—'}
        </p>
      </div>
    </div>
  )
}
