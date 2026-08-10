'use client'

import { useMemo, useState } from 'react'
import { Search, PhoneIncoming, ArrowUpDown } from 'lucide-react'
import CallRow, { type CallRowProps } from './CallRow'
import CallDetailPane from './CallDetailPane'
import { pageWindow } from '@/lib/pagination'

export type CallItem = CallRowProps

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

export default function CallsExplorer({ calls, timeZone }: { calls: CallItem[]; timeZone: string }) {
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch]           = useState('')
  const [chip, setChip]               = useState<CallItem['category'] | 'all'>('all')
  const [page, setPage]               = useState(1)
  const [sort, setSort]               = useState<SortOption>('startedAt-desc')
  const [selectedId, setSelectedId]   = useState<string | null>(null)

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
        call.customerName?.toLowerCase().includes(q)
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

  const selected = calls.find(c => c.id === selectedId) ?? null

  function applySearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(draftSearch)
    setPage(1)
  }
  function updateChip(c: typeof chip) { setChip(c); setPage(1) }

  return (
    <div
      className="rounded-xl sm:rounded-2xl h-full flex overflow-hidden"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
    >
      {/* Left pane — call list. Only ever holds the lightweight fields fetched up front. */}
      <div
        className={`w-full lg:w-[400px] shrink-0 h-full flex-col ${selectedId ? 'hidden lg:flex' : 'flex'}`}
        style={{ borderRight: '1px solid var(--line)' }}
      >
        <div className="p-3 sm:p-4 flex flex-col gap-3 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
          <form onSubmit={applySearch} className="flex gap-2">
            <div
              className="flex-1 min-w-0 flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}
            >
              <Search size={14} style={{ color: 'var(--ink-3)' }} />
              <input
                value={draftSearch}
                onChange={e => setDraftSearch(e.target.value)}
                type="text"
                placeholder="Search by caller or number..."
                className="flex-1 min-w-0 bg-transparent text-sm outline-none"
                style={{ color: 'var(--ink)' }}
              />
            </div>
            <button
              type="submit"
              className="text-sm font-semibold px-3 py-2 rounded-xl text-white shrink-0"
              style={{ background: 'var(--violet)' }}
            >
              <Search size={13} />
            </button>
          </form>

          <div className="flex items-center gap-1.5 rounded-xl px-3" style={{ border: '1px solid var(--line)' }}>
            <ArrowUpDown size={13} style={{ color: 'var(--ink-3)' }} />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortOption)}
              className="flex-1 bg-transparent text-sm font-semibold py-2 outline-none"
              style={{ color: 'var(--ink-2)' }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {CHIPS.map(({ key, label }) => {
              const active = chip === key
              return (
                <button
                  key={key}
                  onClick={() => updateChip(key)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
                  style={{
                    background: active ? 'var(--ink)' : 'var(--paper)',
                    color: active ? '#fff' : 'var(--ink-2)',
                    border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
                  }}
                >
                  {label} <span className="font-mono opacity-70 ml-0.5">{counts[key]}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {paged.map(call => (
            <CallRow
              key={call.id}
              {...call}
              active={selectedId === call.id}
              onSelect={() => setSelectedId(call.id)}
            />
          ))}

          {filtered.length === 0 && (
            <div className="py-16 text-center flex flex-col items-center gap-3 px-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--paper)' }}>
                <PhoneIncoming size={20} style={{ color: 'var(--ink-3)' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {search || chip !== 'all' ? 'No calls match your search' : 'No calls yet — Ellie is ready and waiting'}
              </p>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <div
            className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 text-xs flex-wrap gap-2 shrink-0"
            style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}
          >
            <span>
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-1 items-center">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded-lg font-medium disabled:opacity-40"
                style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
              >
                Prev
              </button>
              {pageWindow(currentPage, totalPages).map((p, i) => p === '…' ? (
                <span key={`ellipsis-${i}`} className="px-1" style={{ color: 'var(--ink-3)' }}>…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="w-6 h-6 rounded-lg font-medium"
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
                className="px-2 py-1 rounded-lg font-medium disabled:opacity-40"
                style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right pane — selected call's detail. Fetched lazily, only on selection. */}
      <div
        className={`flex-1 h-full min-w-0 ${selectedId ? 'flex' : 'hidden lg:flex'}`}
        style={{ background: 'var(--paper)' }}
      >
        <CallDetailPane selected={selected} timeZone={timeZone} onClose={() => setSelectedId(null)} />
      </div>
    </div>
  )
}
