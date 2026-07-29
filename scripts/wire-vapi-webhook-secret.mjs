#!/usr/bin/env node
/**
 * Second half of webhook auth setup — run this AFTER creating a Bearer-Token
 * Custom Credential in the Vapi dashboard (Settings → Credentials):
 *   - Header name: X-Vapi-Secret
 *   - Include Bearer prefix: OFF
 *   - Token value: your VAPI_WEBHOOK_SECRET
 *
 * Attaches that credential to the assistant's server config AND every
 * function tool's own server config — tools have an independent `server`
 * block from the assistant, so the assistant-level secret alone does not
 * cover tool-calls (bookAppointment, checkAvailability, etc.).
 *
 * Usage:
 *   VAPI_PRIVATE_KEY=xxx node scripts/wire-vapi-webhook-secret.mjs <credentialId> <assistantId> [toolId...]
 *
 * If no toolIds are given, it wires every VAPI_*_TOOL_ID currently set in
 * your environment (matching what requiredToolIds() in src/lib/vapi.ts uses).
 */

const [credentialId, assistantId, ...explicitToolIds] = process.argv.slice(2)

if (!credentialId || !assistantId) {
  console.error('Usage: node scripts/wire-vapi-webhook-secret.mjs <credentialId> <assistantId> [toolId...]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set. Run with: VAPI_PRIVATE_KEY=xxx node scripts/wire-vapi-webhook-secret.mjs ...')
  process.exit(1)
}

const toolIds = explicitToolIds.length > 0 ? explicitToolIds : [
  process.env.VAPI_BOOK_APPOINTMENT_TOOL_ID,
  process.env.VAPI_CHECK_AVAILABILITY_TOOL_ID,
  process.env.VAPI_FIND_APPOINTMENTS_TOOL_ID,
  process.env.VAPI_RESCHEDULE_APPOINTMENT_TOOL_ID,
  process.env.VAPI_CANCEL_APPOINTMENT_TOOL_ID,
  process.env.VAPI_TRANSFER_CALL_TOOL_ID,
].filter(Boolean)

async function vapiPatch(path, body) {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${vapiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(json)}`)
  return json
}

// Assistant's own server config (covers end-of-call-report, transfer-destination-request).
const assistant = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
  headers: { Authorization: `Bearer ${vapiKey}` },
}).then(r => r.json())

await vapiPatch(`/assistant/${assistantId}`, {
  server: { ...assistant.server, credentialId },
})
console.log(`✓ assistant ${assistantId} server.credentialId set`)

for (const toolId of toolIds) {
  const tool = await fetch(`https://api.vapi.ai/tool/${toolId}`, {
    headers: { Authorization: `Bearer ${vapiKey}` },
  }).then(r => r.json())

  await vapiPatch(`/tool/${toolId}`, {
    server: { ...tool.server, credentialId },
  })
  console.log(`✓ tool ${toolId} (${tool.function?.name ?? '?'}) server.credentialId set`)
}

console.log('\nDone. Every listed tool + the assistant now sign webhook requests with X-Vapi-Secret.')
console.log('Repeat for every OTHER business/assistant in production — this only wired the one you passed in.')
