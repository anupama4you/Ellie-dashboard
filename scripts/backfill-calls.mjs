#!/usr/bin/env node
/**
 * One-time backfill: pulls each business's full call history from Vapi and
 * upserts it into the local `calls` table, so the dashboard doesn't suddenly
 * show zero history the moment it stops reading calls live from Vapi.
 *
 * Usage:
 *   VAPI_PRIVATE_KEY=xxx NEXT_PUBLIC_SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
 *     node scripts/backfill-calls.mjs
 *
 * Safe to re-run — upserts on vapi_call_id.
 */

import { createClient } from '@supabase/supabase-js'

const vapiKey    = process.env.VAPI_PRIVATE_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!vapiKey || !supabaseUrl || !serviceKey) {
  console.error('Set VAPI_PRIVATE_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY in the environment.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

const ERROR_REASONS = new Set([
  'exceeded-max-duration', 'max-duration-exceeded', 'silence-timed-out',
  'error-assistant-did-not-receive-customer-audio', 'assistant-did-not-receive-customer-audio',
  'error-assistant-not-invalid-tool-call-payload', 'twilio-failed-to-connect-call',
  'twilio-reported-customer-misdialed', 'sip-telephony-provider-closed-call',
  'vonage-rejected', 'assistant-error', 'pipeline-error', 'custom-function-error',
  'worker-shutdown', 'unknown-error',
])

function classify(endedReason) {
  if (endedReason === 'appointment-scheduled') return 'booked'
  if (endedReason === 'call-transferred') return 'transferred'
  if (endedReason === 'customer-did-not-answer' || endedReason === 'voicemail' || endedReason === 'customer-busy') return 'missed'
  if (endedReason && (ERROR_REASONS.has(endedReason) || endedReason.toLowerCase().includes('error'))) return 'errored'
  return 'enquiry'
}

function getCustomer(call) {
  return typeof call.customer === 'object' && call.customer ? call.customer : {}
}

function getAssistantPhone(call) {
  if (typeof call.phoneNumber === 'string') return call.phoneNumber || undefined
  return call.phoneNumber?.number || undefined
}

function durationSeconds(call) {
  const raw = call.duration ?? call.durationSeconds
  if (raw != null && raw > 0) return raw > 7200 ? Math.round(raw / 1000) : Math.round(raw)
  if (call.startedAt && call.endedAt) {
    const ms = new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()
    return ms > 0 ? Math.round(ms / 1000) : 0
  }
  return 0
}

async function fetchAllCalls(assistantId) {
  const calls = []
  let page = 1
  const limit = 100
  for (;;) {
    const params = new URLSearchParams({ assistantId, limit: String(limit), page: String(page), sortOrder: 'DESC' })
    const res = await fetch(`https://api.vapi.ai/v2/call?${params}`, {
      headers: { Authorization: `Bearer ${vapiKey}` },
    })
    if (!res.ok) {
      console.error(`  Vapi ${res.status} fetching page ${page} for ${assistantId}`)
      break
    }
    const data = await res.json()
    const batch = Array.isArray(data) ? data : (data.results ?? [])
    calls.push(...batch)
    if (batch.length < limit) break
    page++
  }
  return calls
}

function toRow(businessId, call) {
  const customer = getCustomer(call)
  return {
    business_id:        businessId,
    vapi_call_id:       call.id,
    vapi_assistant_id:  call.assistantId ?? null,
    call_type:          call.type ?? null,
    status:             call.status ?? null,
    caller_name:        customer.name ?? null,
    caller_phone:       customer.number ?? null,
    assistant_phone:    getAssistantPhone(call) ?? null,
    started_at:         call.startedAt ?? null,
    ended_at:           call.endedAt ?? null,
    duration_seconds:   durationSeconds(call),
    ended_reason:       call.endedReason ?? null,
    outcome:            classify(call.endedReason),
    summary:            call.analysis?.summary ?? call.summary ?? null,
    success_evaluation: call.analysis?.successEvaluation ?? null,
    transcript:         call.artifact?.transcript ?? null,
    recording_url:      call.artifact?.recordingUrl ?? null,
    raw_payload:        call,
  }
}

const { data: businesses, error: bizError } = await supabase
  .from('businesses')
  .select('id, name, vapi_assistant_id')
  .not('vapi_assistant_id', 'is', null)

if (bizError) {
  console.error('Failed to load businesses:', bizError.message)
  process.exit(1)
}

for (const biz of businesses ?? []) {
  console.log(`${biz.name}: fetching call history…`)
  const calls = await fetchAllCalls(biz.vapi_assistant_id)
  console.log(`  ${calls.length} calls found`)
  if (calls.length === 0) continue

  const rows = calls.map(c => toRow(biz.id, c))
  const { error } = await supabase.from('calls').upsert(rows, { onConflict: 'vapi_call_id' })
  if (error) console.error(`  Failed to upsert calls for ${biz.name}:`, error.message)
  else console.log(`  Saved ${rows.length} calls.`)
}

console.log('Backfill complete.')
