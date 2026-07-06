#!/usr/bin/env node
/**
 * One-time setup: creates the "bookAppointment" function tool in Vapi and
 * prints its ID to paste into .env as VAPI_BOOK_APPOINTMENT_TOOL_ID.
 *
 * Vapi cannot call `localhost` — pass a publicly reachable URL (an ngrok
 * tunnel for local testing, or your deployed webhook URL).
 *
 * Usage:
 *   node scripts/setup-vapi-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 *
 * The optional credentialId comes from a Bearer-token Custom Credential you
 * create once in the Vapi dashboard (Server URL → Custom Credentials). If
 * you provide one, also set VAPI_WEBHOOK_SECRET in .env to that same token
 * so the webhook can verify incoming requests.
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-tool.mjs ...')
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
      name: 'bookAppointment',
      description: 'Book an appointment for the caller once you have collected their name, phone number, the service they want, and a preferred date/time.',
      parameters: {
        type: 'object',
        properties: {
          customerName:  { type: 'string', description: "The caller's full name" },
          customerPhone: { type: 'string', description: 'The best phone number to reach the caller on, in the format they gave it' },
          customerEmail: { type: 'string', description: "The caller's email address, if they gave one" },
          service:       { type: 'string', description: 'The service being booked' },
          dateTime:      { type: 'string', description: 'The appointment date and time as a full ISO 8601 datetime in the business\'s local timezone' },
        },
        required: ['customerName', 'customerPhone', 'dateTime'],
      },
    },
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
console.log(`VAPI_BOOK_APPOINTMENT_TOOL_ID=${body.id}`)
if (credentialId) {
  console.log('Also set VAPI_WEBHOOK_SECRET in .env to the same token you used for the Custom Credential.')
}
