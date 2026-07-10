#!/usr/bin/env node
/**
 * One-time setup: creates the "findUpcomingAppointments" function tool in
 * Vapi and prints its ID to paste into .env as VAPI_FIND_APPOINTMENTS_TOOL_ID.
 *
 * Vapi cannot call `localhost` — pass a publicly reachable URL (an ngrok
 * tunnel for local testing, or your deployed webhook URL).
 *
 * Usage:
 *   node scripts/setup-vapi-find-appointments-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 *
 * The optional credentialId comes from a Bearer-token Custom Credential you
 * create once in the Vapi dashboard (Server URL → Custom Credentials). If
 * you provide one, also set VAPI_WEBHOOK_SECRET in .env to that same token
 * so the webhook can verify incoming requests.
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-find-appointments-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-find-appointments-tool.mjs ...')
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
      name: 'findUpcomingAppointments',
      description: 'Look up the caller\'s upcoming appointment(s) before rescheduling. Call this first whenever a caller wants to change or move an existing booking.',
      parameters: {
        type: 'object',
        properties: {
          customerPhone: { type: 'string', description: 'The phone number to search under, if different from the number the caller is calling from' },
        },
        required: [],
      },
    },
    messages: [
      { type: 'request-start', blocking: true, content: 'No problem, let me just pull up your booking. One moment.' },
      { type: 'request-failed', role: 'system', content: 'The lookup failed — apologise briefly without giving technical detail, then call the transferCall tool to connect the caller with the team.' },
      { type: 'request-complete', role: 'system', content: 'Describe the appointment(s) found naturally by service and day/time only — never mention internal reference ids. Ask which one they mean if there is more than one.' },
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
console.log(`VAPI_FIND_APPOINTMENTS_TOOL_ID=${body.id}`)
if (credentialId) {
  console.log('Also set VAPI_WEBHOOK_SECRET in .env to the same token you used for the Custom Credential.')
}
