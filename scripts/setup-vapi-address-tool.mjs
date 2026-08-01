#!/usr/bin/env node
/**
 * One-time setup: creates the "validateAddress" function tool in Vapi and
 * prints its ID. Like sendSms, this tool does not look anything up in the
 * app's database — it validates the caller's address against the real
 * Australian GNAF address database (via the Addressr API) and flags
 * genuinely ambiguous street names instead of guessing.
 *
 * Requires RAPIDAPI_ADDRESS_KEY to be set wherever the webhook runs (see
 * src/lib/addressr.ts) — this script only registers the tool with Vapi, it
 * doesn't need that key itself.
 *
 * This tool is intentionally NOT auto-attached to every assistant (see
 * requiredToolIds() in src/lib/vapi.ts) — after running this script, attach
 * the printed tool ID to the specific assistant(s) that need it yourself,
 * in the Vapi dashboard.
 *
 * Vapi cannot call `localhost` — pass a publicly reachable URL (an ngrok
 * tunnel for local testing, or your deployed webhook URL).
 *
 * Usage:
 *   node scripts/setup-vapi-address-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-address-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-address-tool.mjs ...')
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
      name: 'validateAddress',
      description: "Looks up an address the caller gave against Australia's real address database to confirm it exists, get the exact formatted version, and check whether it's inside the Adelaide metro service area. If the street name matches more than one suburb, it returns the options instead of guessing — ask the caller which one they meant and call this again with the full address including that suburb. Call this once the caller has given an address, before confirming it back to them.",
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'The address exactly as the caller said it, including the suburb if they gave one.' },
        },
        required: ['address'],
      },
    },
    messages: [
      // No request-start message — same reasoning as sendSms: this should
      // feel like a natural pause before confirming back, not an announcement.
      { type: 'request-failed', role: 'system', content: "The address lookup failed — just confirm the address verbally with the caller instead, without mentioning the tool." },
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
