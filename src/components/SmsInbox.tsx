'use client'

import { useState } from 'react'
import { MessagesSquare, SquarePen } from 'lucide-react'
import { dateStrInZone, formatInZone } from '@/lib/timezone'
import { pageWindow } from '@/lib/pagination'
import SmsThreadRow from './SmsThreadRow'
import SmsThreadPane from './SmsThreadPane'

export type ThreadMessage = {
  sid: string
  body: string
  status: string
  direction: 'inbound' | 'outbound'
  dateSent: string | null
}

export type ThreadListItem = {
  /** `phoneDigitsKey` of the other party — stable id for this thread. */
  phone: string
  /** Formatted for display (e.g. "0432 118 774"). */
  displayPhone: string
  /** Raw, as Twilio reported it — what a reply actually gets sent to. */
  rawPhone: string
  name: string | null
  messages: ThreadMessage[]
}

const PAGE_SIZE = 15

function lastMessageTimeLabel(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  return dateStrInZone(d, timeZone) === dateStrInZone(now, timeZone)
    ? formatInZone(d, timeZone, { hour: 'numeric', minute: '2-digit' })
    : formatInZone(d, timeZone, { day: 'numeric', month: 'short' })
}

export default function SmsInbox({ threads, timeZone }: { threads: ThreadListItem[]; timeZone: string }) {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [composingNew, setComposingNew]   = useState(false)
  const [page, setPage]                   = useState(1)
  // Per-viewer, this-session-only — there's no persisted "read" state in
  // this app. Opening a conversation is the closest available signal that
  // staff have seen it, which is what actually clears the reply-needed dot;
  // it doesn't survive a page reload or apply to a different staff member's
  // session, unlike a real read-receipt table would.
  const [seenPhones, setSeenPhones] = useState<Set<string>>(new Set())

  const selected = threads.find(t => t.phone === selectedPhone) ?? null

  const totalPages  = Math.max(1, Math.ceil(threads.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged       = threads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function select(phone: string) {
    setSelectedPhone(phone)
    setComposingNew(false)
    setSeenPhones(prev => prev.has(phone) ? prev : new Set(prev).add(phone))
  }

  function startNewMessage() {
    setSelectedPhone(null)
    setComposingNew(true)
  }

  function handleSent(phoneKey: string) {
    setComposingNew(false)
    select(phoneKey)
  }

  const somethingOpen = !!selectedPhone || composingNew

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-4 max-w-[1220px] w-full mx-auto shrink-0 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
            Messages
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
            Every text between Ellie and your customers, both ways
          </p>
        </div>
        <button
          onClick={startNewMessage}
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-bold text-white shrink-0 transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}
        >
          <SquarePen size={14} />
          <span className="hidden sm:inline">New message</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 px-6 pb-6 max-w-[1220px] w-full mx-auto">
        <div
          className="rounded-2xl h-full flex overflow-hidden"
          style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
        >
          {/* Left pane — one row per conversation, most recently active first. */}
          <div
            className={`w-full lg:w-[360px] shrink-0 h-full flex-col ${somethingOpen ? 'hidden lg:flex' : 'flex'}`}
            style={{ borderRight: '1px solid var(--line)' }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto">
              {paged.map(t => {
                const last = t.messages[t.messages.length - 1]
                return (
                  <SmsThreadRow
                    key={t.phone}
                    displayPhone={t.displayPhone}
                    name={t.name}
                    lastMessageBody={last.body}
                    lastMessageDirection={last.direction}
                    lastMessageStatus={last.status}
                    lastMessageTimeLabel={lastMessageTimeLabel(last.dateSent, timeZone)}
                    needsReply={last.direction === 'inbound' && !seenPhones.has(t.phone)}
                    active={selectedPhone === t.phone}
                    onSelect={() => select(t.phone)}
                  />
                )
              })}

              {threads.length === 0 && (
                <div className="py-16 text-center flex flex-col items-center gap-3 px-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--paper)' }}>
                    <MessagesSquare size={20} style={{ color: 'var(--ink-3)' }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>No messages yet</p>
                  <p className="text-xs max-w-[220px]" style={{ color: 'var(--ink-3)' }}>
                    Texts to and from your Ellie number will show up here
                  </p>
                </div>
              )}
            </div>

            {threads.length > 0 && (
              <div
                className="flex items-center justify-between px-3 py-2.5 text-xs flex-wrap gap-2 shrink-0"
                style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}
              >
                <span>
                  {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, threads.length)} of {threads.length}
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

          {/* Right pane — selected conversation's full thread + reply box, or the new-message composer. */}
          <div
            className={`flex-1 h-full min-w-0 ${somethingOpen ? 'flex' : 'hidden lg:flex'}`}
            style={{ background: 'var(--paper)' }}
          >
            <SmsThreadPane
              // Remounts on every mode/target change so the compose box's
              // local draft/to/error state resets cleanly (see the note in
              // SmsThreadPane) rather than needing an effect to clear it.
              key={composingNew ? 'compose' : selectedPhone ?? 'empty'}
              selected={selected}
              composingNew={composingNew}
              timeZone={timeZone}
              onClose={() => { setSelectedPhone(null); setComposingNew(false) }}
              onSent={handleSent}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
