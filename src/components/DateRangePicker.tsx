'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

type Props = {
  from: string   // YYYY-MM-DD or ''
  to:   string   // YYYY-MM-DD or ''
  onChange: (from: string, to: string) => void
}

function toDate(str: string): Date | undefined {
  return str ? new Date(str + 'T12:00:00') : undefined
}

function fmt(str: string) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short',
  })
}

export default function DateRangePicker({ from, to, onChange }: Props) {
  const [open, setOpen]         = useState(false)
  const [pending, setPending]   = useState<DateRange | undefined>()
  const ref = useRef<HTMLDivElement>(null)

  const displayed: DateRange = { from: toDate(from), to: toDate(to) }
  const active = pending ?? displayed

  // Reset pending when popup closes
  useEffect(() => {
    if (!open) setPending(undefined)
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function handleSelect(range: DateRange | undefined) {
    if (!range) { setPending(undefined); return }
    setPending(range)
    if (range.from && range.to) {
      onChange(
        range.from.toISOString().slice(0, 10),
        range.to.toISOString().slice(0, 10),
      )
      setOpen(false)
    }
    // If only start is picked, keep open so user can pick end
  }

  const hasValue = Boolean(from)
  const label = from && to
    ? `${fmt(from)} – ${fmt(to)}`
    : from
    ? `${fmt(from)} – pick end`
    : 'Date range'

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors btn-ghost"
        style={{
          color:      hasValue ? 'var(--text)' : 'var(--t3)',
          border:     '1px solid var(--border)',
          background: hasValue ? 'rgba(109,74,255,0.08)' : undefined,
        }}>
        <CalendarDays size={12} style={{ color: hasValue ? 'var(--violet)' : 'var(--t4)' }} />
        {label}
        {hasValue && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange('', '') }}
            onKeyDown={e => e.key === 'Enter' && onChange('', '')}
            className="flex items-center hover:opacity-70">
            <X size={10} />
          </span>
        )}
      </button>

      {/* Calendar popup */}
      {open && (
        <div
          className="absolute top-full mt-2 z-50 rounded-2xl shadow-2xl"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', left: 0 }}>
          <DayPicker
            mode="range"
            selected={active}
            onSelect={handleSelect}
            numberOfMonths={2}
            weekStartsOn={1}
            showOutsideDays={false}
            components={{
              PreviousMonthButton: (props) => (
                <button {...props} className="rdp-button_previous">
                  <ChevronLeft size={14} />
                </button>
              ),
              NextMonthButton: (props) => (
                <button {...props} className="rdp-button_next">
                  <ChevronRight size={14} />
                </button>
              ),
            }}
          />
          {/* Footer hint */}
          <div className="px-4 pb-3 pt-0 flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--t5)' }}>
              {pending?.from && !pending?.to
                ? 'Now pick an end date'
                : 'Click a start date'}
            </span>
            {(from || to) && (
              <button
                onClick={() => { onChange('', ''); setPending(undefined); setOpen(false) }}
                className="text-xs transition-colors hover:opacity-70"
                style={{ color: 'var(--t5)' }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
