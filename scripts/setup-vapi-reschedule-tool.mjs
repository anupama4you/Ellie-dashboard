#!/usr/bin/env node
/**
 * One-time setup: creates the "rescheduleAppointment" function tool in Vapi
 * and prints its ID to paste into .env as VAPI_RESCHEDULE_APPOINTMENT_TOOL_ID.
 *
 * If VAPI_RESCHEDULE_APPOINTMENT_TOOL_ID is already set in your environment,
 * this PATCHes that existing tool in place instead of creating a new one —
 * safe to re-run any time the schema changes, since the tool ID is shared
 * globally across every business's assistant.
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

const existingToolId = process.env.VAPI_RESCHEDULE_APPOINTMENT_TOOL_ID
const server = { url: serverUrl, ...(credentialId ? { credentialId } : {}) }

const res = await fetch(`https://api.vapi.ai/tool${existingToolId ? `/${existingToolId}` : ''}`, {
  method: existingToolId ? 'PATCH' : 'POST',
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
          slotRef:       { type: 'string', description: 'The exact ref returned in parentheses next to the slot the caller chose from checkAvailability\'s result, e.g. from "Thursday at 12pm (ref: xxxx)" pass exactly "xxxx". This is the preferred way to specify the new time — always use it when you have one.' },
          newDateTime:   { type: 'string', description: 'Fallback only — use this if you genuinely have no ref from a checkAvailability result. Full ISO 8601 datetime in the business\'s local timezone. Never guess or reconstruct this from a spoken time when a ref is available.' },
        },
        required: ['appointmentId'],
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

if (existingToolId) {
  console.log(`Tool ${existingToolId} updated successfully.`)
} else {
  console.log('Tool created successfully.')
  console.log('Add this to your .env:')
  console.log(`VAPI_RESCHEDULE_APPOINTMENT_TOOL_ID=${body.id}`)
}
if (credentialId) {
  console.log('Also set VAPI_WEBHOOK_SECRET in .env to the same token you used for the Custom Credential.')
}
