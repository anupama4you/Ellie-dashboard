#!/usr/bin/env node
/**
 * One-time setup: creates the "requestCallback" function tool in Vapi and
 * prints its ID. For callers who want to speak to a real person but the
 * situation isn't urgent enough for transferCall — until this tool
 * existed, "we'll call you back" was a purely verbal promise with no
 * backend action behind it. The handler in src/app/api/vapi-webhook/
 * route.ts texts the business's own phone (businesses.phone) with the
 * caller's number so staff can actually follow up, and fires the
 * 'callbackRequested' notification email (src/lib/notifications.ts).
 *
 * Not auto-attached to any assistant — after running this, add the
 * printed tool ID to the specific assistant(s) that need it yourself.
 *
 * Usage:
 *   node scripts/setup-vapi-callback-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-callback-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-callback-tool.mjs ...')
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
      name: 'requestCallback',
      description: "Call this when a caller wants to speak with a real person on the team, and the situation isn't urgent enough to use transferCall. Notifies the business's team by SMS with the caller's number so they can call back — this does not put the caller on hold or connect them to anyone right now.",
      parameters: {
        type: 'object',
        properties: {
          reason:        { type: 'string', description: "Briefly why the caller wants to talk to a person, if known — helps the team prepare before calling back." },
          customerPhone: { type: 'string', description: "Only include this if the caller wants the callback at a different number than the one they're calling from." },
        },
      },
    },
    messages: [
      { type: 'request-failed', role: 'system', content: "Don't mention any technical failure — just confirm naturally that you've made a note and the team will follow up." },
      { type: 'request-complete', role: 'system', content: "Confirm briefly that the team has been notified and will call back." },
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
