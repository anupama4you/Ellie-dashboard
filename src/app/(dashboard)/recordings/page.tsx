import Link from 'next/link'
import { getCurrentBusiness } from '@/lib/business'
import { getLocalCalls, type LocalCall } from '@/lib/calls'
import { formatInZone } from '@/lib/timezone'
import { FileText, Mic, Download } from 'lucide-react'
import WaveformPlayer from '@/components/WaveformPlayer'

function fmtDuration(secs: number) {
  if (!secs || !isFinite(secs) || secs <= 0) return '—'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export default async function RecordingsPage() {
  const { business: biz } = await getCurrentBusiness()
  const timeZone = biz?.timezone ?? 'Australia/Adelaide'

  let calls: LocalCall[] = []
  let fetchError: string | null = null
  if (!biz) {
    fetchError = 'No business profile found.'
  } else {
    try { calls = await getLocalCalls(biz.id, { limit: 200 }) } catch (err) {
      console.error('Failed to fetch local calls:', err)
      fetchError = 'Could not load recordings — please try again shortly.'
    }
  }

  const recordings = calls.filter(c => c.recording_url)

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">

        <div>
          <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
            Recordings
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
            Listen back to any call, with the full transcript alongside
          </p>
        </div>

        <section className="rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          {fetchError ? (
            <div className="py-14 text-center px-6 flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--coral-soft)' }}>
                <Mic size={16} style={{ color: 'var(--coral)' }} />
              </div>
              <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>Setup required</p>
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{fetchError}</p>
            </div>
          ) : recordings.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--violet-soft)' }}>
                <Mic size={20} style={{ color: 'var(--violet)' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>No recordings yet</p>
            </div>
          ) : (
            recordings.map((call, i) => {
              const dur  = call.duration_seconds ?? 0
              const when = call.started_at ? new Date(call.started_at) : null
              return (
                <div
                  key={call.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover-row transition-colors"
                  style={{ borderTop: i > 0 ? '1px solid var(--line)' : undefined }}
                >
                  <div className="min-w-0 shrink-0" style={{ width: 150 }}>
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                      {call.caller_phone ?? call.caller_name ?? 'Unknown caller'}
                    </div>
                    {when && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                        {formatInZone(when, timeZone, { day: 'numeric', month: 'short' })} · {formatInZone(when, timeZone, { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <WaveformPlayer src={call.recording_url!} compact />
                  </div>

                  <span className="text-sm font-mono shrink-0" style={{ color: 'var(--ink-3)', minWidth: 56, textAlign: 'right' }}>
                    {fmtDuration(dur)}
                  </span>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {call.transcript && (
                      <Link
                        href={`/calls/${call.id}`}
                        className="w-8 h-8 rounded-lg flex items-center justify-center btn-ghost"
                        style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
                        title="View transcript"
                        aria-label="View transcript"
                      >
                        <FileText size={13} />
                      </Link>
                    )}
                    <a
                      href={call.recording_url!}
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
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
