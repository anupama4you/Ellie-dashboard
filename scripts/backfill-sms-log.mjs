#!/usr/bin/env node
/**
 * One-time backfill: pulls each business's real outbound SMS history from
 * Twilio and upserts it into sms_log, so the SMS usage cap (src/lib/planUsage.ts)
 * doesn't undercount for every business that had SMS activity before sms_log
 * existed — it started as a brand-new table with no historical data, unlike
 * calls.duration_seconds which already had it.
 *
 * Outbound only, matching what sendSms() itself logs live (inbound customer
 * replies were never part of "messages sent" for the cap) — this must NOT
 * be confused with getSmsCost() (src/lib/sms.ts), which counts both
 * directions for real provider-spend reporting on the admin Costs page.
 *
 * Usage:
 *   TWILIO_ACCOUNT_SID=xxx TWILIO_AUTH_TOKEN=xxx NEXT_PUBLIC_SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
 *     node scripts/backfill-sms-log.mjs
 *
 * Safe to re-run — upserts on twilio_sid.
 */

import { createClient } from '@supabase/supabase-js'

const twilioSid   = process.env.TWILIO_ACCOUNT_SID
const twilioToken = process.env.TWILIO_AUTH_TOKEN
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!twilioSid || !twilioToken || !supabaseUrl || !serviceKey) {
  console.error('Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY in the environment.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)
const twilioAuth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')

async function fetchAllOutbound(businessNumber) {
  const messages = []
  let url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json?${new URLSearchParams({ From: businessNumber, PageSize: '500' })}`
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Basic ${twilioAuth}` } })
    if (!res.ok) {
      console.error(`  Twilio ${res.status} fetching messages for ${businessNumber}`)
      break
    }
    const data = await res.json()
    messages.push(...(data.messages ?? []))
    url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null
  }
  return messages
}

function toRow(businessId, m) {
  return {
    business_id: businessId,
    twilio_sid:  m.sid,
    sent_at:     m.date_sent ?? m.date_created,
  }
}

const { data: businesses, error: bizError } = await supabase
  .from('businesses')
  .select('id, name, twilio_phone_number')
  .not('twilio_phone_number', 'is', null)

if (bizError) {
  console.error('Failed to load businesses:', bizError.message)
  process.exit(1)
}

for (const biz of businesses ?? []) {
  console.log(`${biz.name}: fetching SMS history for ${biz.twilio_phone_number}…`)
  const messages = await fetchAllOutbound(biz.twilio_phone_number)
  console.log(`  ${messages.length} outbound messages found`)
  if (messages.length === 0) continue

  const rows = messages.filter(m => m.sid && (m.date_sent || m.date_created)).map(m => toRow(biz.id, m))
  const { error } = await supabase.from('sms_log').upsert(rows, { onConflict: 'twilio_sid' })
  if (error) console.error(`  Failed to upsert sms_log for ${biz.name}:`, error.message)
  else console.log(`  Saved ${rows.length} sms_log rows.`)
}

console.log('Backfill complete.')
