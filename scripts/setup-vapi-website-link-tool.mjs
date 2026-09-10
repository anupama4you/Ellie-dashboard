#!/usr/bin/env node
/**
 * One-time setup: creates the "sendWebsiteLink" function tool in Vapi and
 * prints its ID. Texts a caller the business's own website URL — offered at
 * the end of a call for callers who want more detail than the assistant can
 * give over the phone. The website itself comes from `businesses.website`,
 * not something the model supplies, so the only model-controlled input is an
 * optional alternate number to text.
 *
 * Not auto-attached to any assistant — after running this, attach the
 * printed tool ID to the specific assistant(s) that need it yourself.
 *
 * Vapi cannot call `localhost` — pass a publicly reachable URL (an ngrok
 * tunnel for local testing, or your deployed webhook URL).
 *
 * Usage:
 *   node scripts/setup-vapi-website-link-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-website-link-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-website-link-tool.mjs ...')
  process.exit(1)
}

const existingToolId = process.env.VAPI_SEND_WEBSITE_LINK_TOOL_ID
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
      name: 'sendWebsiteLink',
      description: "Texts the caller this business's website — offer this near the end of a call to callers who might want more detail than you can give over the phone. Does not need the URL passed in; it's looked up from the business's own record.",
      parameters: {
        type: 'object',
        properties: {
          customerPhone: { type: 'string', description: "Only include this if the caller asked for the text at a different number than the one they're calling from." },
        },
        required: [],
      },
    },
    messages: [
      { type: 'request-failed', role: 'system', content: "The text couldn't be sent — apologise briefly without giving technical detail, and offer to help another way." },
      { type: 'request-complete', role: 'system', content: 'Confirm briefly that the website link was texted to them.' },
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
  console.log(`Tool ID: ${body.id}`)
  console.log('Add this to your .env as VAPI_SEND_WEBSITE_LINK_TOOL_ID.')
  console.log('This is not auto-attached to any assistant — add it to the specific assistant(s) toolIds yourself in the Vapi dashboard.')
}
