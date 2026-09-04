'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessagesSquare, SquarePen } from 'lucide-react'
import { dateStrInZone, formatInZone } from '@/lib/timezone'
import { pageWindow } from '@/lib/pagination'
import { toE164Au, phoneDigitsKey, formatAuPhone } from '@/lib/sms'
import { sendSmsReplyAction } from '@/app/(dashboard)/sms/actions'
import SmsThreadRow from './SmsThreadRow'
import SmsThreadPane from './SmsThreadPane'

const POLL_INTERVAL_MS = 8000

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

type PendingThread = {
  displayPhone: string
  rawPhone: string
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

function isConfirmed(real: ThreadListItem | undefined, pending: ThreadMessage): boolean {
  return !!real?.messages.some(m =>
    m.direction === 'outbound' && m.body === pending.body &&
    Math.abs(new Date(m.dateSent ?? pending.dateSent!).getTime() - new Date(pending.dateSent!).getTime()) < 60_000
  )
}

export default function SmsInbox({ threads, timeZone }: { threads: ThreadListItem[]; timeZone: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [composingNew, setComposingNew]   = useState(false)
  const [page, setPage]                   = useState(1)
  // Per-viewer, this-session-only — there's no persisted "read" state in
  // this app. Maps a thread's phone key to the sid of the last message it
  // had when staff last looked at it, which is what actually clears the
  // reply-needed dot. Keyed by sid (not just "have they ever opened this
  // thread") so a *new* inbound message after that point re-shows the dot —
  // this doesn't survive a page reload or apply to a different staff
  // member's session, unlike a real read-receipt table would.
  const [seenSidByPhone, setSeenSidByPhone] = useState<Map<string, string>>(new Map())
  // Own sent messages shown ahead of the server confirming them, keyed by
  // recipient — lives here rather than in SmsThreadPane specifically so a
  // brand-new conversation's just-sent message survives the mode switch
  // from "composing" to "viewing that thread" (SmsThreadPane remounts on
  // that transition via its `key`, which would otherwise wipe local state
  // at exactly the moment it matters). Reconciled away at render time below
  // once the real data catches up — never cleared reactively from an
  // effect, only ever written from the send handler (a user event) or its
  // own failure path.
  const [pendingByPhone, setPendingByPhone] = useState<Map<string, PendingThread>>(new Map())

  // Threads with any still-unconfirmed sent messages merged in, plus a
  // synthetic entry (sorted first, as the most recent activity) for a
  // brand-new conversation that doesn't exist in `threads` yet.
  const effectiveThreads = useMemo(() => {
    const stillPendingPhones = new Set(pendingByPhone.keys())
    const patched = threads.map(t => {
      const pending = pendingByPhone.get(t.phone)
      if (!pending) return t
      stillPendingPhones.delete(t.phone)
      const unconfirmed = pending.messages.filter(p => !isConfirmed(t, p))
      return unconfirmed.length ? { ...t, messages: [...t.messages, ...unconfirmed] } : t
    })
    const newOnes: ThreadListItem[] = []
    for (const phone of stillPendingPhones) {
      const pending = pendingByPhone.get(phone)!
      if (pending.messages.length === 0) continue
      newOnes.push({ phone, displayPhone: pending.displayPhone, rawPhone: pending.rawPhone, name: null, messages: pending.messages })
    }
    return [...newOnes, ...patched]
  }, [threads, pendingByPhone])

  const selected = effectiveThreads.find(t => t.phone === selectedPhone) ?? null

  const totalPages  = Math.max(1, Math.ceil(effectiveThreads.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged       = effectiveThreads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function markSeen(phone: string) {
    const t = effectiveThreads.find(x => x.phone === phone)
    if (!t) return
    const lastSid = t.messages[t.messages.length - 1].sid
    setSeenSidByPhone(prev => prev.get(phone) === lastSid ? prev : new Map(prev).set(phone, lastSid))
  }

  // Closes over the current `effectiveThreads`, so it always snapshots
  // whatever that thread's latest message was at the moment of the call —
  // including one that arrived via polling while it happened to be open.
  function select(phone: string) {
    if (selectedPhone && selectedPhone !== phone) markSeen(selectedPhone)
    setSelectedPhone(phone)
    setComposingNew(false)
  }

  function closeSelected() {
    if (selectedPhone) markSeen(selectedPhone)
    setSelectedPhone(null)
    setComposingNew(false)
  }

  function startNewMessage() {
    if (selectedPhone) markSeen(selectedPhone)
    setSelectedPhone(null)
    setComposingNew(true)
  }

  // Single send path for both a reply to the open thread and a brand-new
  // conversation. The optimistic message is added immediately either way;
  // for a new conversation, the view switches to it once the send actually
  // succeeds (see the note inline below for why not sooner).
  async function sendMessage(rawTo: string | null, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const targetRawPhone = composingNew
      ? (rawTo?.trim() ? toE164Au(rawTo.trim()) : null)
      : (selected?.rawPhone ?? null)
    if (!targetRawPhone) return { ok: false, error: 'Enter a phone number to send to.' }

    const phoneKey = phoneDigitsKey(targetRawPhone)
    const optimistic: ThreadMessage = {
      sid: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      body,
      status: 'queued',
      direction: 'outbound',
      dateSent: new Date().toISOString(),
    }

    setPendingByPhone(prev => {
      const next = new Map(prev)
      const existing = next.get(phoneKey)
      next.set(phoneKey, {
        displayPhone: existing?.displayPhone ?? formatAuPhone(targetRawPhone),
        rawPhone: targetRawPhone,
        messages: [...(existing?.messages ?? []), optimistic],
      })
      return next
    })

    try {
      await sendSmsReplyAction(targetRawPhone, body)
      // Switch to viewing the (now real) thread only on success — not
      // optimistically before this — so a failed send leaves the composer
      // exactly where it was, with its own error and restored draft, rather
      // than remounting it away (via the `key` change this triggers) out
      // from under the very error handling that's about to run for it.
      if (composingNew) select(phoneKey)
      return { ok: true }
    } catch (err) {
      // It never actually sent — drop the optimistic bubble rather than
      // leaving a permanently-"Sending…" message in the thread.
      setPendingByPhone(prev => {
        const existing = prev.get(phoneKey)
        if (!existing) return prev
        const next = new Map(prev)
        next.set(phoneKey, { ...existing, messages: existing.messages.filter(m => m.sid !== optimistic.sid) })
        return next
      })
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to send message' }
    }
  }

  // Poll for new messages while the page is open, same server-refresh path
  // the manual Refresh button elsewhere in this app already uses — this
  // page reads live from Twilio, not a local table, so there's no realtime
  // subscription to hook into. Paused while the tab isn't visible so an
  // inbox left open in a background tab doesn't keep hitting Twilio's API.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') startTransition(() => router.refresh())
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [router])

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
                    needsReply={last.direction === 'inbound' && t.phone !== selectedPhone && seenSidByPhone.get(t.phone) !== last.sid}
                    active={selectedPhone === t.phone}
                    onSelect={() => select(t.phone)}
                  />
                )
              })}

              {effectiveThreads.length === 0 && (
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

            {effectiveThreads.length > 0 && (
              <div
                className="flex items-center justify-between px-3 py-2.5 text-xs flex-wrap gap-2 shrink-0"
                style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}
              >
                <span>
                  {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, effectiveThreads.length)} of {effectiveThreads.length}
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
              // Safe now that the optimistic message itself lives up here,
              // not in the component that's about to remount.
              key={composingNew ? 'compose' : selectedPhone ?? 'empty'}
              selected={selected}
              composingNew={composingNew}
              timeZone={timeZone}
              onClose={closeSelected}
              onSend={sendMessage}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
