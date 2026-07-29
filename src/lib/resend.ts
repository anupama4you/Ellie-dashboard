/**
 * Raw fetch against Resend's API — no SDK, matching the pattern in lib/twilio.ts.
 * Used to send auth emails (invite, password reset) ourselves instead of
 * through Supabase's built-in sender, which is rate-limited on every plan
 * tier and intended for development only, not production auth traffic.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')

  const from = process.env.RESEND_FROM_EMAIL || 'Ellie Dashboard <onboarding@resend.dev>'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend send failed: ${res.status} ${detail}`)
  }
}
