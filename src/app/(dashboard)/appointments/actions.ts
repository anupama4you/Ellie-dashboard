'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import { zonedTimeToUtc, formatInZone } from '@/lib/timezone'
import { getValidAccessToken, updateCalendarEvent, deleteCalendarEvent } from '@/lib/googleCalendar'
import { durationFor } from '@/lib/availability'
import { mapsLink } from '@/lib/maps'
import { sendSms } from '@/lib/twilio'
import { rememberCustomerName } from '@/lib/customers'

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
  if (error) throw new Error(error.code === '23505' ? 'That time slot is already booked — pick a different time.' : error.message)

  await rememberCustomerName(supabase, biz.id, input.customerPhone, customerName)

  revalidatePath('/appointments')
  revalidatePath('/')
}

export type RescheduleAppointmentInput = {
  appointmentId: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
}

/**
 * Business-owner-triggered reschedule — mirrors the rescheduleAppointment
 * tool call Ellie uses on the phone (same SMS + Google Calendar sync), just
 * triggered from the dashboard instead of a call.
 */
export async function rescheduleAppointmentAction(input: RescheduleAppointmentInput): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')
  if (!input.date || !input.time) throw new Error('Date and time are required.')

  const timeZone = biz.timezone ?? 'Australia/Adelaide'
  const [y, mo, d] = input.date.split('-').map(Number)
  const [h, mi] = input.time.split(':').map(Number)
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) throw new Error('Invalid date or time.')
  const scheduledAt = zonedTimeToUtc(timeZone, y, mo, d, h, mi)

  const supabase = await createClient()
  const { data: existing, error: fetchError } = await supabase
    .from('appointments')
    .select('id, service, customer_name, customer_phone, calendar_event_id')
    .eq('id', input.appointmentId)
    .eq('business_id', biz.id)
    .single()
  if (fetchError || !existing) throw new Error('Appointment not found.')

  const { error } = await supabase.from('appointments').update({
    scheduled_at: scheduledAt.toISOString(),
    status: 'rescheduled',
  }).eq('id', existing.id)
  if (error) throw new Error(error.code === '23505' ? 'That time slot is already booked — pick a different time.' : error.message)

  const { data: services } = await supabase.from('business_services').select('name, duration_minutes').eq('business_id', biz.id)
  const durationMins = durationFor(existing.service, services ?? [])

  if (existing.customer_phone) {
    try {
      const link = mapsLink(biz)
      const smsBody = [
        `Hi ${existing.customer_name ?? ''} 👋`,
        '',
        `Your ${existing.service ?? 'appointment'} with ${biz.name} has been moved to:`,
        `📅 ${formatInZone(scheduledAt, timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}`,
        `⏱️ ${durationMins} minutes`,
        ...(link ? ['', `📍 ${link}`] : []),
        '',
        'See you then! ✅',
      ].join('\n')
      await sendSms(existing.customer_phone, smsBody, biz.twilio_phone_number ?? undefined)
      await supabase.from('appointments').update({ sms_sent: true }).eq('id', existing.id)
    } catch (err) {
      console.error('Failed to send reschedule confirmation SMS:', err)
    }
  }

  if (existing.calendar_event_id) {
    try {
      const google = await getValidAccessToken(supabase, biz.id)
      if (google) {
        const end = new Date(scheduledAt.getTime() + durationMins * 60_000)
        await updateCalendarEvent(google.accessToken, google.calendarId, existing.calendar_event_id, { start: scheduledAt, end })
      }
    } catch (err) {
      console.error('Failed to update Google Calendar event — reschedule already saved locally:', err)
    }
  }

  revalidatePath('/appointments')
  revalidatePath('/')
}

/**
 * Business-owner-triggered cancellation — mirrors the cancelAppointment tool
 * call Ellie uses on the phone (same SMS + Google Calendar event removal).
 */
export async function cancelAppointmentAction(appointmentId: string): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')

  const supabase = await createClient()
  const { data: existing, error: fetchError } = await supabase
    .from('appointments')
    .select('id, service, customer_name, customer_phone, scheduled_at, calendar_event_id')
    .eq('id', appointmentId)
    .eq('business_id', biz.id)
    .single()
  if (fetchError || !existing) throw new Error('Appointment not found.')

  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', existing.id)
  if (error) throw new Error(error.message)

  const timeZone = biz.timezone ?? 'Australia/Adelaide'

  if (existing.customer_phone) {
    try {
      const smsBody = [
        `Hi ${existing.customer_name ?? ''} 👋`,
        '',
        `Your ${existing.service ?? 'appointment'} with ${biz.name} on ${formatInZone(new Date(existing.scheduled_at), timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })} has been cancelled.`,
        '',
        "Let us know if you'd like to rebook.",
      ].join('\n')
      await sendSms(existing.customer_phone, smsBody, biz.twilio_phone_number ?? undefined)
    } catch (err) {
      console.error('Failed to send cancellation SMS:', err)
    }
  }

  if (existing.calendar_event_id) {
    try {
      const google = await getValidAccessToken(supabase, biz.id)
      if (google) {
        await deleteCalendarEvent(google.accessToken, google.calendarId, existing.calendar_event_id)
      }
    } catch (err) {
      console.error('Failed to delete Google Calendar event — cancellation already saved locally:', err)
    }
  }

  revalidatePath('/appointments')
  revalidatePath('/')
}

export type EditAppointmentInput = {
  appointmentId: string
  customerName: string
  customerPhone: string
  service: string
  notes: string
}

/** Edits the booking's details (name/phone/service/notes) — doesn't touch the time; use rescheduleAppointmentAction for that. */
export async function editAppointmentAction(input: EditAppointmentInput): Promise<void> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) throw new Error('No business profile found.')

  const customerName = input.customerName.trim()
  if (!customerName) throw new Error('Customer name is required.')

  const supabase = await createClient()
  const { error } = await supabase.from('appointments').update({
    customer_name: customerName,
    customer_phone: input.customerPhone.trim() || null,
    service: input.service.trim() || null,
    notes: input.notes.trim() || null,
  }).eq('id', input.appointmentId).eq('business_id', biz.id)
  if (error) throw new Error(error.message)

  await rememberCustomerName(supabase, biz.id, input.customerPhone, customerName)

  revalidatePath('/appointments')
  revalidatePath('/')
}
