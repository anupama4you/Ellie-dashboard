#!/usr/bin/env node
/**
 * One-time setup: creates the "getCurrentDateTime" function tool in Vapi and
 * prints its ID to paste into .env as VAPI_GET_CURRENT_DATETIME_TOOL_ID.
 *
 * {{now}} is always UTC — every attempt to have the model convert it to the
 * business's own timezone itself has failed in a different way (wrong month,
 * date not rolling over across the UTC boundary, imprecise minutes). This
 * tool computes the already-localized date/time server-side instead, so
 * there's nothing left for the model to calculate.
 *
 * If VAPI_GET_CURRENT_DATETIME_TOOL_ID is already set in your environment,
 * this PATCHes that existing tool in place instead of creating a new one —
 * safe to re-run any time the schema/wording changes, since the tool ID is
 * shared globally across every business's assistant.
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
 *   node scripts/setup-vapi-datetime-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-datetime-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-datetime-tool.mjs ...')
  process.exit(1)
}

const existingToolId = process.env.VAPI_GET_CURRENT_DATETIME_TOOL_ID
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
      name: 'getCurrentDateTime',
      description: "Get the real current date and time, already converted to the business's own timezone. Call this whenever the caller asks what the date or time is, or whenever you need to ground yourself and have no more recent checkAvailability/findUpcomingAppointments result to rely on instead. Never calculate or estimate the current date/time yourself from {{now}} (which is always UTC) — always call this tool instead.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    messages: [
      // No request-start message — this is a near-instant lookup with
      // nothing worth announcing; same reasoning as validateAddress/sendSms.
      { type: 'request-failed', role: 'system', content: "The current date/time lookup failed — apologise briefly and continue the conversation without stating a date or time." },
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
  console.log(`VAPI_GET_CURRENT_DATETIME_TOOL_ID=${body.id}`)
  console.log('This is not auto-attached to any assistant — add it to the specific assistant(s) toolIds yourself in the Vapi dashboard.')
}
if (credentialId) {
  console.log('Also set VAPI_WEBHOOK_SECRET in .env to the same token you used for the Custom Credential.')
}
