#!/usr/bin/env node
/**
 * One-time setup: creates a native "transferCall" tool in Vapi and prints its
 * ID to paste into .env as VAPI_TRANSFER_CALL_TOOL_ID.
 *
 * Unlike our other tools, this has no `destinations` configured — per Vapi's
 * API, when a transferCall tool has no destinations, it asks `server.url`
 * for the destination at transfer time (a `transfer-destination-request`
 * webhook message), which lets one shared tool resolve a different real
 * phone number per business (via businesses.transfer_phone_number) instead
 * of needing a separate tool per client.
 *
 * Vapi cannot call `localhost` — pass a publicly reachable URL (an ngrok
 * tunnel for local testing, or your deployed webhook URL).
 *
 * Usage:
 *   node scripts/setup-vapi-transfer-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 *
 * The optional credentialId comes from a Bearer-token Custom Credential you
 * create once in the Vapi dashboard (Server URL → Custom Credentials). If
 * you provide one, also set VAPI_WEBHOOK_SECRET in .env to that same token
 * so the webhook can verify incoming requests.
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-transfer-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-transfer-tool.mjs ...')
  process.exit(1)
}

const server = { url: serverUrl, ...(credentialId ? { credentialId } : {}) }

const res = await fetch('https://api.vapi.ai/tool', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${vapiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'transferCall',
    messages: [
      { type: 'request-start', blocking: true, content: 'Sure, one moment while I connect you.' },
      { type: 'request-failed', role: 'system', content: 'A transfer is not available right now — apologise briefly, take a message (name, number, brief reason) and reassure them someone will call back.' },
    ],
    server,
  }),
})

const body = await res.json()

if (!res.ok) {
  console.error(`Failed (${res.status}):`, JSON.stringify(body, null, 2))
  process.exit(1)
}

console.log('Tool created successfully.')
console.log('Add this to your .env:')
console.log(`VAPI_TRANSFER_CALL_TOOL_ID=${body.id}`)
if (credentialId) {
  console.log('Also set VAPI_WEBHOOK_SECRET in .env to the same token you used for the Custom Credential.')
}
