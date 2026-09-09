#!/usr/bin/env node
/**
 * One-time setup: creates the "sendBookingLink" function tool in Vapi and
 * prints its ID. For businesses that text a link to their own online booking
 * page instead of taking the booking over the phone (e.g. SASH Salon) — no
 * appointment record gets created, so this is deliberately separate from
 * bookAppointment. Unlike the generic sendSms tool, the actual message text
 * is admin-controlled (businesses.sms_template_booking_link, editable in the
 * admin panel and visible read-only in the client's own Settings) — the
 * model only supplies the link itself and whatever it already knows about
 * the caller, not the full wording.
 *
 * Like sendSms, this is intentionally NOT auto-attached to every assistant —
 * after running this script, attach the printed tool ID to the specific
 * assistant(s) that need it yourself, in the Vapi dashboard.
 *
 * Vapi cannot call `localhost` — pass a publicly reachable URL (an ngrok
 * tunnel for local testing, or your deployed webhook URL).
 *
 * Usage:
 *   node scripts/setup-vapi-booking-link-tool.mjs https://your-public-url.example.com/api/vapi-webhook [credentialId]
 */

const serverUrl = process.argv[2]
const credentialId = process.argv[3]

if (!serverUrl) {
  console.error('Usage: node scripts/setup-vapi-booking-link-tool.mjs <public-webhook-url> [credentialId]')
  process.exit(1)
}

const vapiKey = process.env.VAPI_PRIVATE_KEY
if (!vapiKey) {
  console.error('VAPI_PRIVATE_KEY is not set in your environment. Run with: VAPI_PRIVATE_KEY=xxx node scripts/setup-vapi-booking-link-tool.mjs ...')
  process.exit(1)
}

const existingToolId = process.env.VAPI_SEND_BOOKING_LINK_TOOL_ID
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
      name: 'sendBookingLink',
      description: "Texts the caller a link to this business's online booking page — use this instead of bookAppointment for businesses that don't take bookings over the phone. Does not check availability or create an appointment; it only sends the link.",
      parameters: {
        type: 'object',
        properties: {
          bookingLink:   { type: 'string', description: 'The exact online booking page URL for this business, from your own instructions. Never invent or guess one.' },
          customerName:  { type: 'string', description: "The caller's name, if you've asked for it — used to personalise the text. Omit if you don't have it." },
          service:       { type: 'string', description: 'The service the caller asked about, if known.' },
          customerPhone: { type: 'string', description: "Only include this if the caller asked for the text at a different number than the one they're calling from." },
        },
        required: ['bookingLink'],
      },
    },
    messages: [
      { type: 'request-failed', role: 'system', content: "The text couldn't be sent — apologise briefly without giving technical detail, and offer to help another way." },
      { type: 'request-complete', role: 'system', content: 'Confirm briefly that the booking link was texted to them.' },
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
  console.log('Add this to your .env as VAPI_SEND_BOOKING_LINK_TOOL_ID.')
  console.log('This is not auto-attached to any assistant — add it to the specific assistant(s) toolIds yourself in the Vapi dashboard.')
}
if (credentialId) {
  console.log('Also set VAPI_WEBHOOK_SECRET in .env to the same token you used for the Custom Credential.')
}
