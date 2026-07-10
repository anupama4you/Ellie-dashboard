'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { zonedTimeToUtc } from '@/lib/timezone'

export type ManualAppointmentInput = {
  customerName: string
  customerPhone: string
  service: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
}

/**
 * Appointments the business owner adds themselves (walk-ins, phone bookings
 * they took directly) rather than ones Ellie booked. Deliberately leaves
 * `vapi_call_id` null — that's the existing signal the Appointments page
 * already uses to distinguish "Booked by Ellie" from "Booked by you".
 */
export async function createManualAppointment(input: ManualAppointmentInput): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')

  const customerName = input.customerName.trim()
  if (!customerName) throw new Error('Customer name is required.')
  if (!input.date || !input.time) throw new Error('Date and time are required.')

  const timeZone = biz.timezone ?? 'Australia/Adelaide'
  const [y, mo, d] = input.date.split('-').map(Number)
  const [h, mi] = input.time.split(':').map(Number)
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) throw new Error('Invalid date or time.')
  const scheduledAt = zonedTimeToUtc(timeZone, y, mo, d, h, mi)

  const supabase = await createClient()
  const { error } = await supabase.from('appointments').insert({
    business_id:    biz.id,
    customer_name:  customerName,
    customer_phone: input.customerPhone.trim() || null,
    service:        input.service.trim() || null,
    scheduled_at:   scheduledAt.toISOString(),
    status:         'confirmed',
    vapi_call_id:   null,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/appointments')
  revalidatePath('/')
}
