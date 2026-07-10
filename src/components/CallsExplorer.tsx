'use client'

import { Fragment, useMemo, useState } from 'react'
import { Search, PhoneIncoming, ArrowUpDown } from 'lucide-react'
import CallRow, { type CallRowProps } from './CallRow'
import CallDetailPanel from './CallDetailPanel'

export type CallItem = CallRowProps & {
  status?: string
  endedReason?: string
  successEvaluation?: string
  transcript?: string
  vapiCallId?: string
}

const CHIPS: { key: CallItem['category'] | 'all'; label: string }[] = [
  { key: 'all',         label: 'All'         },
  { key: 'booked',      label: 'Booked'      },
  { key: 'rebooked',    label: 'Rebooked'    },
  { key: 'enquiry',     label: 'Enquiries'   },
  { key: 'transferred', label: 'Transferred' },
  { key: 'missed',      label: 'Missed'      },
  { key: 'errored',     label: 'Errored'     },
]

const PAGE_SIZE = 10

type SortOption = 'startedAt-desc' | 'startedAt-asc' | 'duration-desc' | 'duration-asc'
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'startedAt-desc', label: 'Newest first' },
  { value: 'startedAt-asc',  label: 'Oldest first' },
  { value: 'duration-desc',  label: 'Longest first' },
  { value: 'duration-asc',   label: 'Shortest first' },
]

/** Windowed page numbers with an ellipsis for far-away pages, e.g. 1 2 3 … 15. */
function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
  const result: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…')
    result.push(sorted[i])
  }
  return result
}

export default function CallsExplorer({ calls, timeZone }: { calls: CallItem[]; timeZone: string }) {
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch]           = useState('')
  const [chip, setChip]               = useState<CallItem['category'] | 'all'>('all')
  const [page, setPage]               = useState(1)
  const [sort, setSort]               = useState<SortOption>('startedAt-desc')
  const [expandedId, setExpandedId]   = useState<string | null>(null)

  const [sortField, sortDir] = sort.split('-') as ['startedAt' | 'duration', 'asc' | 'desc']

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: calls.length, booked: 0, rebooked: 0, enquiry: 0, transferred: 0, missed: 0, errored: 0 }
    for (const call of calls) c[call.category]++
    return c
  }, [calls])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = calls.filter(call => {
      if (chip !== 'all' && call.category !== chip) return false
      if (!q) return true
      return (
        call.customerNumber?.toLowerCase().includes(q) ||
        call.customerName?.toLowerCase().includes(q) ||
        call.summary?.toLowerCase().includes(q)
      )
    })
    const sorted = [...rows].sort((a, b) => {
      const av = sortField === 'duration' ? a.durationSecs : (a.startedAtIso ? new Date(a.startedAtIso).getTime() : 0)
      const bv = sortField === 'duration' ? b.durationSecs : (b.startedAtIso ? new Date(b.startedAtIso).getTime() : 0)
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return sorted
  }, [calls, chip, search, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function applySearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(draftSearch)
    setPage(1)
  }
  function updateChip(c: typeof chip) { setChip(c); setPage(1) }

  return (
    <div className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      {/* Search + sort */}
      <form onSubmit={applySearch} className="p-4 flex gap-2">
        <div
          className="flex-1 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
          style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}
        >
          <Search size={15} style={{ color: 'var(--ink-3)' }} />
          <input
            value={draftSearch}
            onChange={e => setDraftSearch(e.target.value)}
            type="text"
            placeholder="Search by caller, number or what was said..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>
        <button
          type="submit"
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white shrink-0"
          style={{ background: 'var(--violet)' }}
        >
          <Search size={13} /> Search
        </button>
        <div className="flex items-center gap-1.5 rounded-xl px-3 shrink-0" style={{ border: '1px solid var(--line)' }}>
          <ArrowUpDown size={13} style={{ color: 'var(--ink-3)' }} />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortOption)}
            className="bg-transparent text-sm font-semibold py-2 outline-none"
            style={{ color: 'var(--ink-2)' }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </form>

      {/* Chips */}
      <div className="flex gap-2 px-4 pb-4 flex-wrap">
        {CHIPS.map(({ key, label }) => {
          const active = chip === key
          return (
            <button
              key={key}
              onClick={() => updateChip(key)}
              className="text-sm font-semibold px-3.5 py-1.5 rounded-full transition-colors"
              style={{
                background: active ? 'var(--ink)' : 'var(--paper)',
                color: active ? '#fff' : 'var(--ink-2)',
                border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
              }}
            >
              {label} <span className="font-mono text-xs opacity-70 ml-1">{counts[key]}</span>
            </button>
          )
        })}
      </div>

      {/* Rows */}
      <div style={{ borderTop: '1px solid var(--line)' }}>
        {paged.map(call => (
          <Fragment key={call.id}>
            <CallRow
              {...call}
              isExpanded={expandedId === call.id}
              onToggle={() => setExpandedId(id => (id === call.id ? null : call.id))}
            />
            {expandedId === call.id && (
              <CallDetailPanel
                timeZone={timeZone}
                call={{
                  type: call.type,
                  customerNumber: call.customerNumber,
                  customerName: call.customerName,
                  startedAtIso: call.startedAtIso,
                  durationSecs: call.durationSecs,
                  status: call.status,
                  endedReason: call.endedReason,
                  successEvaluation: call.successEvaluation,
                  summary: call.summary,
                  recordingUrl: call.recordingUrl,
                  transcript: call.transcript,
                  vapiCallId: call.vapiCallId,
                }}
              />
            )}
          </Fragment>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-16 text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--paper)' }}>
            <PhoneIncoming size={20} style={{ color: 'var(--ink-3)' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {search || chip !== 'all' ? 'No calls match your search' : 'No calls yet — Ellie is ready and waiting'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > 0 && (
        <div
          className="flex items-center justify-between px-5 py-3.5 text-sm flex-wrap gap-2"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}
        >
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} calls
          </span>
          <div className="flex gap-1.5 items-center">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
              style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
            >
              Previous
            </button>
            {pageWindow(currentPage, totalPages).map((p, i) => p === '…' ? (
              <span key={`ellipsis-${i}`} className="px-1.5" style={{ color: 'var(--ink-3)' }}>…</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p)}
                className="w-8 h-8 rounded-lg font-medium"
                style={{
                  background: p === currentPage ? 'var(--ink)' : undefined,
                  color: p === currentPage ? '#fff' : 'var(--ink)',
                  border: p === currentPage ? '1px solid var(--ink)' : '1px solid var(--line)',
                }}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
              style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
