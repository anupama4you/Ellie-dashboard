import {
  Phone, Clock, CheckCircle2, XCircle, Mic, FileText,
  PhoneIncoming, PhoneOutgoing, Globe,
} from 'lucide-react'
import WaveformPlayer from './WaveformPlayer'
import CopyButton from './CopyButton'
import { formatInZone } from '@/lib/timezone'

function fmtDuration(secs: number) {
  if (!secs || !isFinite(secs) || secs <= 0) return '—'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

type Msg = { role: 'user' | 'assistant'; text: string }

function parseTranscript(raw: string): Msg[] {
  const msgs: Msg[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const userMatch = trimmed.match(/^(user|customer|caller):\s*/i)
    const asstMatch = trimmed.match(/^(ai|assistant|bot|ellie|agent):\s*/i)
    if (userMatch) {
      msgs.push({ role: 'user', text: trimmed.slice(userMatch[0].length) })
    } else if (asstMatch) {
      msgs.push({ role: 'assistant', text: trimmed.slice(asstMatch[0].length) })
    } else if (msgs.length > 0) {
      msgs[msgs.length - 1].text += ' ' + trimmed
    }
  }
  return msgs
}

function CallTypeLabel({ type }: { type?: string }) {
  if (type === 'outboundPhoneCall') return (
    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--violet)' }}>
      <PhoneOutgoing size={11} /> Outbound
    </span>
  )
  if (type === 'webCall') return (
    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--violet)' }}>
      <Globe size={11} /> Web
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--signal)' }}>
      <PhoneIncoming size={11} /> Inbound
    </span>
  )
}

export type CallDetailData = {
  type?: string
  customerNumber?: string
  customerName?: string
  startedAtIso?: string
  durationSecs: number
  status?: string
  endedReason?: string
  successEvaluation?: string
  summary?: string
  recordingUrl?: string
  transcript?: string
  vapiCallId?: string
}

export default function CallDetailPanel({ call, timeZone }: { call: CallDetailData; timeZone: string }) {
  const dt = call.startedAtIso ? new Date(call.startedAtIso) : null
  const msgs = call.transcript ? parseTranscript(call.transcript) : []
  const endedLabel = call.endedReason
    ? call.endedReason.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null

  return (
    <div className="px-5 py-4 flex flex-col gap-4" style={{ background: 'var(--paper)', borderTop: '1px solid var(--line)' }}>

      {/* Header + stats */}
      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--violet-soft)' }}>
              <Phone size={15} style={{ color: 'var(--violet)' }} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <div className="text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>
                  {call.customerNumber ?? call.customerName ?? 'Unknown caller'}
                </div>
                {call.customerNumber && <CopyButton text={call.customerNumber} />}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <CallTypeLabel type={call.type} />
                {dt && (
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    {formatInZone(dt, timeZone, { dateStyle: 'long', timeStyle: 'short' })}
                  </span>
                )}
              </div>
            </div>
          </div>
          {endedLabel && (
            <span className="text-xs font-medium px-3 py-1.5 rounded-full shrink-0" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}>
              {endedLabel}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
          {[
            { icon: <Clock size={12} />, label: 'Duration', value: call.durationSecs > 0 ? fmtDuration(call.durationSecs) : '—' },
            { icon: <Phone size={12} />, label: 'Status', value: call.status ? call.status.charAt(0).toUpperCase() + call.status.slice(1) : '—' },
            {
              icon: call.successEvaluation === 'true'
                ? <CheckCircle2 size={12} style={{ color: 'var(--signal)' }} />
                : call.successEvaluation === 'false'
                ? <XCircle size={12} style={{ color: 'var(--coral)' }} />
                : <span />,
              label: 'Outcome',
              value: call.successEvaluation === 'true' ? 'Successful'
                : call.successEvaluation === 'false' ? 'Unsuccessful'
                : '—',
            },
          ].map(({ icon, label, value }) => (
            <div key={label}>
              <div className="flex items-center gap-1.5 text-xs mb-1.5" style={{ color: 'var(--ink-3)' }}>{icon} {label}</div>
              <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Summary */}
      {call.summary && (
        <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>AI Summary</h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>{call.summary}</p>
        </div>
      )}

      {/* Recording */}
      {call.recordingUrl && (
        <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Mic size={13} style={{ color: 'var(--violet)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Recording</h3>
          </div>
          <WaveformPlayer src={call.recordingUrl} />
        </div>
      )}

      {/* Transcript — scrollable so long conversations don't grow the page */}
      {call.transcript ? (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <FileText size={13} style={{ color: 'var(--violet)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Transcript</h3>
            {msgs.length > 0 && (
              <span className="text-xs ml-auto" style={{ color: 'var(--ink-3)' }}>{msgs.length} messages</span>
            )}
          </div>

          {msgs.length > 0 ? (
            <div className="p-4 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 420 }}>
              {msgs.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === 'assistant' ? 'flex-row-reverse' : ''}`}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1"
                    style={{
                      background: msg.role === 'user' ? 'rgba(139,133,160,0.15)' : 'var(--violet-soft)',
                      color:      msg.role === 'user' ? 'var(--ink-3)'           : 'var(--violet)',
                    }}>
                    {msg.role === 'user' ? 'C' : 'E'}
                  </div>
                  <div className="max-w-[82%] px-3.5 py-2.5 text-sm leading-relaxed"
                    style={{
                      background:   msg.role === 'user' ? 'var(--paper)' : 'var(--violet-soft)',
                      color:        msg.role === 'user' ? 'var(--ink-2)' : 'var(--violet)',
                      borderRadius: msg.role === 'user' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                    }}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <pre className="p-4 text-sm leading-relaxed whitespace-pre-wrap font-sans overflow-y-auto" style={{ color: 'var(--ink-2)', maxHeight: 420 }}>
              {call.transcript}
            </pre>
          )}
        </div>
      ) : (
        <div className="rounded-xl p-6 text-center" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <FileText size={22} className="mx-auto mb-2" style={{ color: 'var(--ink-3)' }} />
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            No transcript — enable transcript in your Vapi assistant settings
          </p>
        </div>
      )}

      {call.vapiCallId && (
        <p className="text-center text-xs font-mono" style={{ color: 'var(--ink-3)' }}>{call.vapiCallId}</p>
      )}
    </div>
  )
}
