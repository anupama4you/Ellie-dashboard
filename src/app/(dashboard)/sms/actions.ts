'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentBusiness } from '@/lib/business'
import { sendSms } from '@/lib/twilio'

/** Sends a reply from the business's own Twilio number to a customer, re-deriving the business server-side rather than trusting a client-supplied id. */
export async function sendSmsReplyAction(to: string, body: string): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')

  const trimmedBody = body.trim()
  if (!trimmedBody) throw new Error('Message cannot be empty.')
  if (!to.trim()) throw new Error('No recipient.')

  await sendSms(to, trimmedBody, biz.twilio_phone_number)

  revalidatePath('/sms')
}
