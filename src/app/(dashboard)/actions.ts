'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { setTwilioVoiceUrl, VAPI_INBOUND_VOICE_URL } from '@/lib/twilio'
import { toE164Au } from '@/lib/sms'
import { getUserBusinesses, getSelectedBusinessId, SELECTED_BUSINESS_COOKIE } from '@/lib/business'

/**
 * Pauses or resumes Ellie answering the currently-selected location's
 * number, from the sidebar toggle. Works entirely at the Twilio level —
 * repoints the number's VoiceUrl at a plain call-forwarding TwiML endpoint
 * (paused) or back at Vapi's own inbound handler (active). Deliberately
 * doesn't touch Vapi's phone-number `assistantId`/`fallbackDestination` —
 * that path proved unreliable for Twilio-imported numbers in testing (calls
 * fell through to Twilio's own voicemail instead of the configured fallback).
 */
export async function setLineActive(active: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const businessId = await getSelectedBusinessId(supabase, user.id)
  if (!businessId) throw new Error('No business profile found.')

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, twilio_phone_number, transfer_phone_number')
    .eq('id', businessId)
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

/**
 * Switches which of the current user's locations the dashboard shows.
 * Re-validates ownership against the DB rather than trusting the submitted
 * id — a forged businessId must never let a user view another client's
 * location. Redirecting to `/` (rather than revalidating the current path)
 * keeps things simple: a page mid-render against one location's data (e.g.
 * a specific call's detail pane) can't end up showing another location's
 * record under the same URL.
 */
export async function selectLocationAction(businessId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const businesses = await getUserBusinesses(supabase, user.id)
  if (!businesses.some(b => b.id === businessId)) {
    throw new Error('That location does not belong to your account.')
  }

  const cookieStore = await cookies()
  cookieStore.set(SELECTED_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  redirect('/')
}
