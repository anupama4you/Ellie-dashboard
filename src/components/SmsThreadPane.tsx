'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, MessagesSquare, Send, AlertTriangle } from 'lucide-react'
import { initials, avatarColor } from '@/lib/avatar'
import { dateStrInZone, formatInZone } from '@/lib/timezone'
import { sendSmsReplyAction } from '@/app/(dashboard)/sms/actions'
import type { ThreadListItem } from './SmsInbox'

function bubbleTimeLabel(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const isToday = dateStrInZone(d, timeZone) === dateStrInZone(now, timeZone)
  return isToday
    ? formatInZone(d, timeZone, { hour: 'numeric', minute: '2-digit' })
    : formatInZone(d, timeZone, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function SmsThreadPane({
  selected, timeZone, onClose,
}: {
  selected: ThreadListItem | null
  timeZone: string
  onClose: () => void
}) {
  const [draft, setDraft]     = useState('')
  const [error, setError]     = useState('')
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Jump to the latest message whenever the open thread changes or grows
  // (switching conversations, or a reply just sent) — a chat inbox should
  // always open scrolled to "now", not to the oldest message in history.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [selected?.phone, selected?.messages.length])

  if (!selected) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--card)' }}>
          <MessagesSquare size={20} style={{ color: 'var(--ink-3)' }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Select a conversation</p>
        <p className="text-xs max-w-[240px]" style={{ color: 'var(--ink-3)' }}>
          Its full message history shows up here.
        </p>
      </div>
    )
  }

  const displayName = selected.name?.trim() || selected.displayPhone
  const avatar = avatarColor(displayName)

  function send() {
    const body = draft.trim()
    if (!body || !selected) return
    setError('')
    startTransition(async () => {
      try {
        await sendSmsReplyAction(selected.rawPhone, body)
        setDraft('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
      }
    })
  }

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center gap-3 px-3 sm:px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm w-fit transition-opacity hover:opacity-70 lg:hidden shrink-0"
          style={{ color: 'var(--ink-3)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: avatar.bg, color: avatar.color }}>
          {initials(displayName)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{displayName}</p>
          {selected.name && <p className="text-xs truncate font-mono" style={{ color: 'var(--ink-3)' }}>{selected.displayPhone}</p>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 px-3 sm:px-5 py-4">
        {selected.messages.map(m => {
          const outbound = m.direction === 'outbound'
          const failed = m.status === 'failed' || m.status === 'undelivered'
          return (
            <div key={m.sid} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[75%] flex flex-col" style={{ alignItems: outbound ? 'flex-end' : 'flex-start' }}>
                <div
                  className="rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words"
                  style={outbound
                    ? { background: 'var(--violet)', color: '#fff', borderBottomRightRadius: 4 }
                    : { background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)', borderBottomLeftRadius: 4 }}
                >
                  {m.body}
                </div>
                <div className="flex items-center gap-1 mt-0.5 px-1">
                  {failed && <AlertTriangle size={10} style={{ color: 'var(--coral)' }} />}
                  <span className="text-[10px] font-mono" style={{ color: failed ? 'var(--coral)' : 'var(--ink-3)' }}>
                    {failed ? 'Not delivered' : bubbleTimeLabel(m.dateSent, timeZone)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 sm:p-4 shrink-0" style={{ borderTop: '1px solid var(--line)' }}>
        {error && <p className="text-xs mb-2" style={{ color: 'var(--coral)' }}>{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Write a message…"
            rows={1}
            className="flex-1 min-w-0 rounded-xl px-3.5 py-2.5 text-sm resize-none outline-none"
            style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}
          />
          <button
            onClick={send}
            disabled={isPending || !draft.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white disabled:opacity-40"
            style={{ background: 'var(--violet)' }}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
