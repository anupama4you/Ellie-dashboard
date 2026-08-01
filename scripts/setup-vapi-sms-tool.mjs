#!/usr/bin/env node
/**
 * One-time setup: creates the "sendSms" function tool in Vapi and
 * prints its ID. Unlike bookAppointment/checkAvailability/etc., this tool
 * does not look anything up in the app's database — it's for assistants
 * that aren't linked to a `businesses` row yet (demos, one-off trials
 * created straight in the Vapi dashboard). The assistant composes the
 * message itself from its own system prompt and this tool just sends it.
 *
 * This tool is intentionally NOT auto-attached to every assistant the way
 * the booking tools are (see requiredToolIds() in src/lib/vapi.ts) — after
 * running this script, attach the printed tool ID to the specific
 * assistant(s) that need it yourself, in the Vapi dashboard.
 *
 * Vapi cannot call `localhost` — pass a publicly reachable URL (an ngrok
 * tunnel for local testing, or your deployed webhook URL).
 *
 * Usage:
 *   node scripts/setup-vapi-sms-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-sms-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-sms-tool.mjs ...')
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
      name: 'sendSms',
      description: "Sends a text message to the caller's phone number. Compose the message content yourself using the company details, links, and phrasing from your own instructions — this tool does not look anything up, it only sends exactly the text you give it.",
      parameters: {
        type: 'object',
        properties: {
          message:       { type: 'string', description: 'The full text message to send, written out exactly as it should be sent.' },
          customerPhone: { type: 'string', description: "Only include this if the caller asked for the text at a different number than the one they're calling from." },
        },
        required: ['message'],
      },
    },
    messages: [
      // No request-start message on purpose — this assistant's own prompt says
      // "don't announce you're about to use it," so it should stay silent
      // until the tool actually succeeds or fails.
      { type: 'request-failed', role: 'system', content: "The text couldn't be sent — apologise briefly without giving technical detail, and offer to help another way." },
      { type: 'request-complete', role: 'system', content: 'Confirm briefly that the text was sent.' },
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
console.log(`Tool ID: ${body.id}`)
console.log('This is not auto-attached to any assistant — add it to the specific assistant(s) toolIds yourself in the Vapi dashboard.')
if (credentialId) {
  console.log('Also set VAPI_WEBHOOK_SECRET in .env to the same token you used for the Custom Credential.')
}
