'use client'

import { useState } from 'react'
import { MessagesSquare } from 'lucide-react'
import { dateStrInZone, formatInZone } from '@/lib/timezone'
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
  const selected = threads.find(t => t.phone === selectedPhone) ?? null

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-4 max-w-[1220px] w-full mx-auto shrink-0">
        <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
          Messages
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
          Every text between Ellie and your customers, both ways
        </p>
      </div>

      <div className="flex-1 min-h-0 px-6 pb-6 max-w-[1220px] w-full mx-auto">
        <div
          className="rounded-2xl h-full flex overflow-hidden"
          style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
        >
          {/* Left pane — one row per conversation, most recently active first. */}
          <div
            className={`w-full lg:w-[360px] shrink-0 h-full flex-col ${selectedPhone ? 'hidden lg:flex' : 'flex'}`}
            style={{ borderRight: '1px solid var(--line)' }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto">
              {threads.map(t => {
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
                    active={selectedPhone === t.phone}
                    onSelect={() => setSelectedPhone(t.phone)}
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
          </div>

          {/* Right pane — selected conversation's full thread + reply box. */}
          <div
            className={`flex-1 h-full min-w-0 ${selectedPhone ? 'flex' : 'hidden lg:flex'}`}
            style={{ background: 'var(--paper)' }}
          >
            <SmsThreadPane selected={selected} timeZone={timeZone} onClose={() => setSelectedPhone(null)} />
          </div>
        </div>
      </div>
    </div>
  )
}
