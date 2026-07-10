#!/usr/bin/env node
/**
 * One-time setup: creates the "rescheduleAppointment" function tool in Vapi
 * and prints its ID to paste into .env as VAPI_RESCHEDULE_APPOINTMENT_TOOL_ID.
 *
 * Vapi cannot call `localhost` — pass a publicly reachable URL (an ngrok
 * tunnel for local testing, or your deployed webhook URL).
 *
 * Usage:
 *   node scripts/setup-vapi-reschedule-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 *
 * The optional credentialId comes from a Bearer-token Custom Credential you
 * create once in the Vapi dashboard (Server URL → Custom Credentials). If
 * you provide one, also set VAPI_WEBHOOK_SECRET in .env to that same token
 * so the webhook can verify incoming requests.
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-reschedule-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-reschedule-tool.mjs ...')
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
      name: 'rescheduleAppointment',
      description: 'Move an existing appointment to a new date/time. Only call this after findUpcomingAppointments and after the caller has confirmed exactly which appointment they mean.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string', description: 'The exact appointment reference returned by findUpcomingAppointments for the booking the caller confirmed' },
          newDateTime:   { type: 'string', description: 'The new appointment date and time as a full ISO 8601 datetime in the business\'s local timezone' },
        },
        required: ['appointmentId', 'newDateTime'],
      },
    },
    messages: [
      { type: 'request-start', blocking: true, content: 'Perfect. Please hold for just a moment while I update your booking.' },
      { type: 'request-failed', role: 'system', content: 'The reschedule failed — apologise briefly without giving technical detail, then call the transferCall tool to connect the caller with the team instead of retrying.' },
      { type: 'request-complete', role: 'system', content: 'Confirm the appointment has been moved, warmly, in one short sentence using the result just returned.' },
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
console.log(`VAPI_RESCHEDULE_APPOINTMENT_TOOL_ID=${body.id}`)
if (credentialId) {
  console.log('Also set VAPI_WEBHOOK_SECRET in .env to the same token you used for the Custom Credential.')
}
