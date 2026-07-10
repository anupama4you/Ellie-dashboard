#!/usr/bin/env node
/**
 * One-time setup: creates the "checkAvailability" function tool in Vapi and
 * prints its ID to paste into .env as VAPI_CHECK_AVAILABILITY_TOOL_ID.
 *
 * Vapi cannot call `localhost` — pass a publicly reachable URL (an ngrok
 * tunnel for local testing, or your deployed webhook URL).
 *
 * Usage:
 *   node scripts/setup-vapi-availability-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-availability-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-availability-tool.mjs ...')
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
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Check the business calendar for the next available appointment slots. Call this once you know which service the caller wants, before suggesting any date or time — never guess a time yourself.',
      parameters: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'The service the caller wants to book, if known — used to look up its duration' },
        },
        required: [],
      },
    },
    messages: [
      { type: 'request-start', blocking: true, content: 'Please hold for just a moment while I check our appointment calendar.' },
      { type: 'request-failed', role: 'system', content: 'The calendar check failed — apologise briefly without giving technical detail, then call the transferCall tool to connect the caller with the team instead of retrying.' },
      { type: 'request-complete', role: 'system', content: 'Offer the caller the returned time options naturally in one or two sentences — never read out ISO timestamps.' },
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
console.log(`VAPI_CHECK_AVAILABILITY_TOOL_ID=${body.id}`)
if (credentialId) {
  console.log('Also set VAPI_WEBHOOK_SECRET in .env to the same token you used for the Custom Credential.')
}
