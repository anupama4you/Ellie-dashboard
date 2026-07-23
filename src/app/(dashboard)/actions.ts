'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { setTwilioVoiceUrl, VAPI_INBOUND_VOICE_URL } from '@/lib/twilio'
import { toE164Au } from '@/lib/sms'

/**
 * Pauses or resumes Ellie answering this business's number, from the
 * sidebar toggle. Works entirely at the Twilio level — repoints the
 * number's VoiceUrl at a plain call-forwarding TwiML endpoint (paused) or
 * back at Vapi's own inbound handler (active). Deliberately doesn't touch
 * Vapi's phone-number `assistantId`/`fallbackDestination` — that path
 * proved unreliable for Twilio-imported numbers in testing (calls fell
 * through to Twilio's own voicemail instead of the configured fallback).
 */
export async function setLineActive(active: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, twilio_phone_number, transfer_phone_number')
    .eq('user_id', user.id)
    .single()
  if (!biz) throw new Error('No business profile found.')
  if (!biz.twilio_phone_number) throw new Error('No phone number connected to this business yet.')

  if (!active && !biz.transfer_phone_number) {
    throw new Error('Set a "Number to transfer calls to" on your Business page before pausing — otherwise callers would have nowhere to go.')
  }

  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL)?.replace(/\/$/, '')
  if (!active && !appUrl) throw new Error('APP_URL is not configured — contact support.')

  const voiceUrl = active
    ? VAPI_INBOUND_VOICE_URL
    : `${appUrl}/api/twilio-forward-call?to=${encodeURIComponent(toE164Au(biz.transfer_phone_number))}`

  await setTwilioVoiceUrl(biz.twilio_phone_number, voiceUrl)

  const { error } = await supabase.from('businesses').update({ line_paused: !active }).eq('id', biz.id)
  if (error) throw new Error(error.message)

  revalidatePath('/')
}
