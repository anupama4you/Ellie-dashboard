import Link from 'next/link'
import { LinkPendingFade } from './LinkPending'

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type MonthChip = { id: string; label: string; color: string; bg: string }

export default function MonthGrid({
  gridDates,
  currentMonthKey,
  todayStr,
  selectedDate,
  itemsByDay,
  hrefFor,
}: {
  /** 42 `YYYY-MM-DD` strings, Monday-start, six full weeks spanning the visible month. */
  gridDates: string[]
  /** `YYYY-MM` of the month being browsed — cells outside it render muted. */
  currentMonthKey: string
  todayStr: string
  selectedDate: string
  itemsByDay: Map<string, MonthChip[]>
  hrefFor: (dateStr: string) => string
}) {
  return (
    <div className="rounded-xl sm:rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      {/* Day-of-week header */}
      <div className="grid grid-cols-7" style={{ borderBottom: '1px solid var(--line)' }}>
        {DOW_LABELS.map(label => (
          <div key={label} className="text-center py-1.5 sm:py-2 text-[0.62rem] sm:text-xs font-bold tracking-widest" style={{ color: 'var(--ink-3)' }}>
            {label}
          </div>
        ))}
      </div>

      {/* 6-week grid */}
      <div className="grid grid-cols-7">
        {gridDates.map((dStr, i) => {
          const inMonth  = dStr.slice(0, 7) === currentMonthKey
          const isToday  = dStr === todayStr
          const isSel    = dStr === selectedDate
          const items    = itemsByDay.get(dStr) ?? []
          const dayNum   = Number(dStr.split('-')[2])
          const col      = i % 7
          const row      = Math.floor(i / 7)

          return (
            <Link
              key={dStr}
              href={hrefFor(dStr)}
              className="flex flex-col min-h-[58px] sm:min-h-[92px] lg:min-h-[112px] transition-colors hover-row"
              style={{
                background: isSel ? 'var(--violet-soft)' : undefined,
                borderRight: col < 6 ? '1px solid var(--line)' : undefined,
                borderBottom: row < 5 ? '1px solid var(--line)' : undefined,
              }}
            >
              <LinkPendingFade className="flex flex-col flex-1 min-h-0 px-1 pt-1 sm:px-1.5 sm:pt-1.5">
                <span
                  className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-[0.68rem] sm:text-xs font-bold shrink-0"
                  style={{
                    background: isToday ? 'var(--violet)' : undefined,
                    color: isToday ? '#fff' : inMonth ? 'var(--ink)' : 'var(--ink-3)',
                    opacity: inMonth || isToday ? 1 : 0.55,
                  }}
                >
                  {dayNum}
                </span>

                {/* Desktop/tablet — small text chips */}
                <div className="hidden sm:flex flex-col gap-0.5 mt-1 min-h-0 overflow-hidden">
                  {items.slice(0, 3).map(item => (
                    <span
                      key={item.id}
                      className="text-[0.62rem] leading-[1.1rem] px-1 rounded truncate font-semibold"
                      style={{ background: item.bg, color: item.color, opacity: inMonth ? 1 : 0.55 }}
                    >
                      {item.label}
                    </span>
                  ))}
                  {items.length > 3 && (
                    <span className="text-[0.6rem] px-1" style={{ color: 'var(--ink-3)', opacity: inMonth ? 1 : 0.55 }}>
                      +{items.length - 3} more
                    </span>
                  )}
                </div>

                {/* Mobile — dots only, no room for text */}
                <div className="flex sm:hidden gap-0.5 flex-wrap mt-1">
                  {items.slice(0, 4).map(item => (
                    <span key={item.id} className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.color, opacity: inMonth ? 1 : 0.5 }} />
                  ))}
                  {items.length > 4 && (
                    <span className="text-[0.55rem] leading-none" style={{ color: 'var(--ink-3)' }}>+{items.length - 4}</span>
                  )}
                </div>
              </LinkPendingFade>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
