'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, FileText, Download, Mic, ChevronDown } from 'lucide-react'
import WaveformPlayer from './WaveformPlayer'
import CopyButton from './CopyButton'
import { pageWindow } from '@/lib/pagination'

export type RecordingItem = {
  id: string
  displayName: string
  customerNumber?: string
  summary: string
  recordingUrl: string
  hasTranscript: boolean
  startedTime?: string
  startedDate?: string
  durationSecs: number
}

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]

const PAGE_SIZE = 10

function fmtDuration(secs: number) {
  if (!secs || !isFinite(secs) || secs <= 0) return '—'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export default function RecordingsExplorer({ recordings, range }: { recordings: RecordingItem[]; range: string }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recordings
    return recordings.filter(r =>
      r.displayName.toLowerCase().includes(q) ||
      r.customerNumber?.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q)
    )
  }, [recordings, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  return (
    <div className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      {/* Search + range */}
      <div className="p-4 flex gap-2">
        <div
          className="flex-1 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
          style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}
        >
          <Search size={15} style={{ color: 'var(--ink-3)' }} />
          <input
            value={search}
            onChange={e => updateSearch(e.target.value)}
            type="text"
            placeholder="Search transcripts..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-xl px-3 shrink-0" style={{ border: '1px solid var(--line)' }}>
          <ChevronDown size={13} style={{ color: 'var(--ink-3)' }} />
          <select
            value={range}
            onChange={e => router.push(`/recordings?range=${e.target.value}`)}
            className="bg-transparent text-sm font-semibold py-2 outline-none"
            style={{ color: 'var(--ink-2)' }}
          >
            {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Rows */}
      <div style={{ borderTop: '1px solid var(--line)' }}>
        {paged.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--violet-soft)' }}>
              <Mic size={20} style={{ color: 'var(--violet)' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {search ? 'No recordings match your search' : 'No recordings yet'}
            </p>
          </div>
        ) : (
          paged.map((r, i) => (
            <div
              key={r.id}
              className="flex items-center gap-4 px-5 py-3.5 hover-row transition-colors"
              style={{ borderTop: i > 0 ? '1px solid var(--line)' : undefined }}
            >
              <div className="min-w-0 shrink-0" style={{ width: 170 }}>
                <div className="flex items-center gap-1">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.displayName}</p>
                  {r.customerNumber && <CopyButton text={r.customerNumber} />}
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{r.summary}</p>
              </div>

              <div className="flex-1 min-w-0">
                <WaveformPlayer src={r.recordingUrl} compact />
              </div>

              <div className="text-right shrink-0 hidden sm:block" style={{ minWidth: 64 }}>
                <p className="text-xs font-mono" style={{ color: 'var(--ink-3)' }}>{r.startedTime ?? '—'}</p>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--ink-3)' }}>{fmtDuration(r.durationSecs)}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {r.hasTranscript && (
                  <Link
                    href={`/calls/${r.id}`}
                    className="w-8 h-8 rounded-lg flex items-center justify-center btn-ghost"
                    style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
                    title="View transcript"
                    aria-label="View transcript"
                  >
                    <FileText size={13} />
                  </Link>
                )}
                <a
                  href={r.recordingUrl}
                  download
                  className="w-8 h-8 rounded-lg flex items-center justify-center btn-ghost"
                  style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
                  title="Download recording"
                  aria-label="Download recording"
                >
                  <Download size={13} />
                </a>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer + pagination */}
      {filtered.length > 0 && (
        <div
          className="flex items-center justify-between px-5 py-3.5 text-sm flex-wrap gap-2"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}
        >
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} recordings
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
