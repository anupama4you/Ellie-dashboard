import { AlertTriangle } from 'lucide-react'
import { initials, avatarColor } from '@/lib/avatar'
import { smsStatusStyle } from '@/lib/sms'

export type SmsThreadRowProps = {
  displayPhone: string
  name: string | null
  lastMessageBody: string
  lastMessageDirection: 'inbound' | 'outbound'
  lastMessageStatus: string
  lastMessageTimeLabel: string
}

export default function SmsThreadRow({
  displayPhone, name, lastMessageBody, lastMessageDirection, lastMessageStatus, lastMessageTimeLabel, active, onSelect,
}: SmsThreadRowProps & { active: boolean; onSelect: () => void }) {
  const displayName = name?.trim() || displayPhone
  const avatar = avatarColor(displayName)
  // Delivery status is only actionable for our own outbound texts — an
  // inbound message's status ("received") isn't something staff can act on.
  const status = lastMessageDirection === 'outbound' ? smsStatusStyle(lastMessageStatus) : null
  const failed = lastMessageStatus === 'failed' || lastMessageStatus === 'undelivered'

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
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{displayName}</p>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>
            {lastMessageDirection === 'outbound' && <span style={{ color: 'var(--ink-4, var(--ink-3))' }}>You: </span>}
            {lastMessageBody || '—'}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {status && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                style={{ color: status.color, background: status.bg }}
              >
                {failed && <AlertTriangle size={9} />}
                {status.label}
              </span>
            )}
            <span className="text-[11px] font-mono" style={{ color: 'var(--ink-3)' }}>{lastMessageTimeLabel}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
