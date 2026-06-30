'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

// Returns 0=Mon ... 6=Sun offset for first day
function getFirstDayOffset(year: number, month: number) {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

type Props = {
  selectedDate: string   // YYYY-MM-DD
  viewYear: number
  viewMonth: number      // 0-indexed
  appointmentDates: string[]
  missedCallDates: string[]
}

export default function CalendarView({ selectedDate, viewYear, viewMonth, appointmentDates, missedCallDates }: Props) {
  const router = useRouter()

  const apptSet   = new Set(appointmentDates)
  const missedSet = new Set(missedCallDates)

  const daysInMonth  = getDaysInMonth(viewYear, viewMonth)
  const firstOffset  = getFirstDayOffset(viewYear, viewMonth)
  const monthLabel   = new Date(viewYear, viewMonth, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' })
  const todayStr     = new Date().toISOString().slice(0, 10)

  function navMonth(delta: number) {
    let y = viewYear, m = viewMonth + delta
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    const newDays = getDaysInMonth(y, m)
    const selDay  = parseInt(selectedDate.slice(8, 10))
    const day     = Math.min(selDay, newDays)
    const next    = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    router.push(`/calendar?date=${next}`)
  }

  function selectDay(day: number) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    router.push(`/calendar?date=${dateStr}`)
  }

  // Build grid cells: null for empty leading cells, number for days
  const cells: (number | null)[] = [
    ...Array.from({ length: firstOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div className="flex flex-col gap-3 p-4">

      {/* Month nav */}
      <div className="flex items-center justify-between mb-1">
        <button onClick={() => navMonth(-1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors btn-ghost"
          style={{ color: 'var(--t3)' }}>
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{monthLabel}</span>
        <button onClick={() => navMonth(1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors btn-ghost"
          style={{ color: 'var(--t3)' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-0.5">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-medium py-1" style={{ color: 'var(--t5)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr    = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isSelected = dateStr === selectedDate
          const isToday    = dateStr === todayStr
          const hasAppt    = apptSet.has(dateStr)
          const hasMissed  = missedSet.has(dateStr)

          return (
            <button key={i} onClick={() => selectDay(day)}
              className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg transition-all"
              style={{
                background: isSelected
                  ? 'linear-gradient(135deg, rgba(167,139,250,0.28), rgba(244,114,182,0.14))'
                  : isToday ? 'rgba(167,139,250,0.08)' : 'transparent',
                border: isSelected
                  ? '1px solid rgba(167,139,250,0.4)'
                  : isToday ? '1px solid rgba(167,139,250,0.15)' : '1px solid transparent',
                color: isSelected ? 'var(--text)' : isToday ? '#a78bfa' : 'var(--t3)',
              }}>
              <span className="text-xs font-medium leading-none">{day}</span>
              {(hasAppt || hasMissed) && (
                <div className="flex gap-0.5 mt-0.5">
                  {hasAppt   && <span className="w-1 h-1 rounded-full" style={{ background: '#a78bfa' }} />}
                  {hasMissed && <span className="w-1 h-1 rounded-full" style={{ background: '#f87171' }} />}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#a78bfa' }} />
          <span className="text-xs" style={{ color: 'var(--t5)' }}>Appointments</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#f87171' }} />
          <span className="text-xs" style={{ color: 'var(--t5)' }}>Missed calls</span>
        </div>
      </div>
    </div>
  )
}
