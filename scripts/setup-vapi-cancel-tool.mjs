#!/usr/bin/env node
/**
 * One-time setup: creates the "cancelAppointment" function tool in Vapi and
 * prints its ID to paste into .env as VAPI_CANCEL_APPOINTMENT_TOOL_ID.
 *
 * Vapi cannot call `localhost` — pass a publicly reachable URL (an ngrok
 * tunnel for local testing, or your deployed webhook URL).
 *
 * Usage:
 *   node scripts/setup-vapi-cancel-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 *
 * The optional credentialId comes from a Bearer-token Custom Credential you
 * create once in the Vapi dashboard (Server URL → Custom Credentials). If
 * you provide one, also set VAPI_WEBHOOK_SECRET in .env to that same token
 * so the webhook can verify incoming requests.
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-cancel-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-cancel-tool.mjs ...')
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
      name: 'cancelAppointment',
      description: 'Cancel an existing appointment entirely. Only call this after findUpcomingAppointments and after the caller has explicitly confirmed they want to cancel (not reschedule) that specific booking.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string', description: 'The exact appointment reference returned by findUpcomingAppointments for the booking the caller confirmed' },
        },
        required: ['appointmentId'],
      },
    },
    messages: [
      { type: 'request-start', blocking: true, content: 'Sure, let me cancel that for you. One moment.' },
      { type: 'request-failed', role: 'system', content: 'The cancellation failed — apologise briefly without giving technical detail, then call the transferCall tool to connect the caller with the team instead of retrying.' },
      { type: 'request-complete', role: 'system', content: 'Confirm the appointment has been cancelled, warmly, in one short sentence using the result just returned.' },
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
console.log(`VAPI_CANCEL_APPOINTMENT_TOOL_ID=${body.id}`)
if (credentialId) {
  console.log('Also set VAPI_WEBHOOK_SECRET in .env to the same token you used for the Custom Credential.')
}
