'use client'

import { useMemo, useState } from 'react'
import { Search, PhoneIncoming, ChevronUp, ChevronDown } from 'lucide-react'
import CallRow, { type CallRowProps, ROW_COLUMNS } from './CallRow'

export type CallItem = CallRowProps

const CHIPS: { key: CallItem['category'] | 'all'; label: string }[] = [
  { key: 'all',         label: 'All'         },
  { key: 'booked',      label: 'Booked'      },
  { key: 'enquiry',     label: 'Enquiries'   },
  { key: 'transferred', label: 'Transferred' },
  { key: 'missed',      label: 'Missed'      },
  { key: 'errored',     label: 'Errored'     },
]

const PAGE_SIZE = 25

type SortField = 'startedAt' | 'duration'

function SortHeader({
  label, active, dir, onClick,
}: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-left" style={{ color: active ? 'var(--ink)' : 'var(--ink-3)' }}>
      {label}
      {active ? (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronDown size={12} style={{ opacity: 0.35 }} />}
    </button>
  )
}

export default function CallsExplorer({ calls }: { calls: CallItem[] }) {
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch]           = useState('')
  const [chip, setChip]               = useState<CallItem['category'] | 'all'>('all')
  const [page, setPage]               = useState(1)
  const [sortField, setSortField]     = useState<SortField>('startedAt')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: calls.length, booked: 0, enquiry: 0, transferred: 0, missed: 0, errored: 0 }
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
  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
  }

  return (
    <div className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      {/* Search */}
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

      {/* Column headers */}
      <div
        className="grid items-center gap-3 px-5 py-2.5 text-xs font-bold uppercase tracking-wide"
        style={{ gridTemplateColumns: ROW_COLUMNS, borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: 'var(--paper)' }}
      >
        <span style={{ color: 'var(--ink-3)' }}>Type</span>
        <span style={{ color: 'var(--ink-3)' }}>Customer</span>
        <span style={{ color: 'var(--ink-3)' }}>Assistant #</span>
        <span style={{ color: 'var(--ink-3)' }}>Outcome</span>
        <SortHeader label="Start time" active={sortField === 'startedAt'} dir={sortDir} onClick={() => toggleSort('startedAt')} />
        <SortHeader label="Duration" active={sortField === 'duration'} dir={sortDir} onClick={() => toggleSort('duration')} />
        <span />
      </div>

      {/* Rows */}
      <div>
        {paged.map(call => <CallRow key={call.id} {...call} />)}
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
          className="flex items-center justify-between px-5 py-3.5 text-sm"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}
        >
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} calls
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
              style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
            >
              Previous
            </button>
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
