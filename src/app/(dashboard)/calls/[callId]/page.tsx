import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getCurrentBusiness } from '@/lib/business'
import { getLocalCall } from '@/lib/calls'
import CallDetailPanel from '@/components/CallDetailPanel'

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ callId: string }>
}) {
  const { callId } = await params

  const { business: biz } = await getCurrentBusiness()
  if (!biz) notFound()
  const timeZone = biz.timezone ?? 'Australia/Adelaide'

  const call = await getLocalCall(biz.id, callId)
  if (!call) notFound()

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-5">

          <Link href="/calls"
            className="flex items-center gap-1.5 text-sm w-fit transition-opacity hover:opacity-70"
            style={{ color: 'var(--ink-3)' }}>
            <ArrowLeft size={14} /> Back to calls
          </Link>

          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
            <CallDetailPanel
              timeZone={timeZone}
              call={{
                type: call.call_type ?? undefined,
                customerNumber: call.caller_phone ?? undefined,
                customerName: call.caller_name ?? undefined,
                startedAtIso: call.started_at ?? undefined,
                durationSecs: call.duration_seconds ?? 0,
                status: call.status ?? undefined,
                endedReason: call.ended_reason ?? undefined,
                successEvaluation: call.success_evaluation ?? undefined,
                summary: call.summary ?? undefined,
                recordingUrl: call.recording_url ?? undefined,
                transcript: call.transcript ?? undefined,
                vapiCallId: call.vapi_call_id ?? undefined,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
