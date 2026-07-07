import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentBusiness } from '@/lib/business'
import { getLocalCall } from '@/lib/calls'
import {
  ArrowLeft, Phone, Clock,
  CheckCircle2, XCircle, Mic, FileText,
  PhoneIncoming, PhoneOutgoing, Globe,
} from 'lucide-react'
import WaveformPlayer from '@/components/WaveformPlayer'

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
      msgs.push({ role: 'user',      text: trimmed.slice(userMatch[0].length) })
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

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ callId: string }>
}) {
  const { callId } = await params

  const { business: biz } = await getCurrentBusiness()
  if (!biz) notFound()

  const call = await getLocalCall(biz.id, callId)
  if (!call) notFound()

  const dur      = call.duration_seconds ?? 0
  const msgs     = call.transcript ? parseTranscript(call.transcript) : []
  const dt       = call.started_at ? new Date(call.started_at) : null
  const endedRaw = call.ended_reason ?? ''
  const endedLabel = endedRaw
    ? endedRaw.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-5">

          {/* Back */}
          <Link href="/calls"
            className="flex items-center gap-1.5 text-sm w-fit transition-opacity hover:opacity-70"
            style={{ color: 'var(--t4)' }}>
            <ArrowLeft size={14} /> Back to calls
          </Link>

          {/* Header */}
          <div className="rounded-xl p-5"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(109,74,255,0.1)' }}>
                  <Phone size={17} style={{ color: 'var(--violet)' }} />
                </div>
                <div>
                  <div className="text-xl font-bold leading-tight" style={{ color: 'var(--text)' }}>
                    {call.caller_phone ?? call.caller_name ?? 'Unknown caller'}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <CallTypeLabel type={call.call_type ?? undefined} />
                    {dt && (
                      <span className="text-xs" style={{ color: 'var(--t4)' }}>
                        {dt.toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {endedLabel && (
                <span className="text-xs font-medium px-3 py-1.5 rounded-full shrink-0"
                  style={{ background: 'rgba(109,74,255,0.1)', color: 'var(--violet)' }}>
                  {endedLabel}
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5"
              style={{ borderTop: '1px solid var(--b2)' }}>
              {[
                {
                  icon: <Clock size={12} />,
                  label: 'Duration',
                  value: dur > 0 ? fmtDuration(dur) : '—',
                },
                {
                  icon: <Phone size={12} />,
                  label: 'Status',
                  value: call.status ? call.status.charAt(0).toUpperCase() + call.status.slice(1) : '—',
                },
                {
                  icon: call.success_evaluation === 'true'
                    ? <CheckCircle2 size={12} style={{ color: 'var(--signal)' }} />
                    : call.success_evaluation === 'false'
                    ? <XCircle size={12} style={{ color: 'var(--coral)' }} />
                    : <span />,
                  label: 'Outcome',
                  value: call.success_evaluation === 'true'  ? 'Successful'
                       : call.success_evaluation === 'false' ? 'Unsuccessful'
                       : '—',
                },
              ].map(({ icon, label, value }) => (
                <div key={label}>
                  <div className="flex items-center gap-1.5 text-xs mb-1.5" style={{ color: 'var(--t4)' }}>
                    {icon} {label}
                  </div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Summary */}
          {call.summary && (
            <div className="rounded-xl p-5"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>AI Summary</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--t2)' }}>
                {call.summary}
              </p>
            </div>
          )}

          {/* Recording */}
          {call.recording_url && (
            <div className="rounded-xl p-5"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-4">
                <Mic size={14} style={{ color: 'var(--violet)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recording</h2>
              </div>
              <WaveformPlayer src={call.recording_url} />
            </div>
          )}

          {/* Transcript */}
          {call.transcript ? (
            <div className="rounded-xl overflow-hidden"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 px-5 py-4"
                style={{ borderBottom: '1px solid var(--b2)' }}>
                <FileText size={14} style={{ color: 'var(--violet)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Transcript</h2>
                {msgs.length > 0 && (
                  <span className="text-xs ml-auto" style={{ color: 'var(--t5)' }}>
                    {msgs.length} messages
                  </span>
                )}
              </div>

              {msgs.length > 0 ? (
                <div className="p-5 flex flex-col gap-3">
                  {msgs.map((msg, i) => (
                    <div key={i} className={`flex gap-2.5 ${msg.role === 'assistant' ? 'flex-row-reverse' : ''}`}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1"
                        style={{
                          background: msg.role === 'user' ? 'rgba(139,133,160,0.2)' : 'rgba(109,74,255,0.15)',
                          color:      msg.role === 'user' ? 'var(--t3)'              : 'var(--violet)',
                        }}>
                        {msg.role === 'user' ? 'C' : 'E'}
                      </div>
                      <div className="max-w-[82%] px-3.5 py-2.5 text-sm leading-relaxed"
                        style={{
                          background:   msg.role === 'user' ? 'var(--b4)' : 'rgba(109,74,255,0.08)',
                          color:        msg.role === 'user' ? 'var(--t2)'  : 'var(--violet)',
                          borderRadius: msg.role === 'user' ? '4px 12px 12px 12px'   : '12px 4px 12px 12px',
                        }}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="p-5 text-sm leading-relaxed whitespace-pre-wrap font-sans"
                  style={{ color: 'var(--t2)' }}>
                  {call.transcript}
                </pre>
              )}
            </div>
          ) : (
            <div className="rounded-xl p-8 text-center"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <FileText size={26} className="mx-auto mb-2" style={{ color: 'var(--t6)' }} />
              <p className="text-sm" style={{ color: 'var(--t5)' }}>
                No transcript — enable transcript in your Vapi assistant settings
              </p>
            </div>
          )}

          <p className="text-center text-xs pb-2 font-mono" style={{ color: 'var(--t6)' }}>
            {call.vapi_call_id}
          </p>
        </div>
      </div>
    </div>
  )
}
