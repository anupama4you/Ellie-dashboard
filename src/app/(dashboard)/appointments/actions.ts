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
import { bookingConfirmationSms, rescheduleConfirmationSms, cancellationConfirmationSms } from '@/lib/smsTemplates'
import { sendNotificationEmail } from '@/lib/notifications'

export type ManualAppointmentInput = {
  customerName: string
  customerPhone: string
  service: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  staffId?: string | null
}

/**
 * Appointments the business owner adds themselves (walk-ins, phone bookings
 * they took directly) rather than ones Ellie booked. Deliberately leaves
 * `vapi_call_id` null — that's the existing signal the Appointments page
 * already uses to distinguish "Booked by Ellie" from "Booked by you".
 *
 * Returns `{ error }` instead of throwing for expected/validation failures —
 * in production this Next.js version strips the .message off any error
 * thrown across the Server Action boundary (only a bare digest reaches the
 * client), so a thrown Error here would render as a message-less crash.
 */
export async function createManualAppointment(input: ManualAppointmentInput): Promise<{ error: string | null }> {
  const { user, business: biz } = await getCurrentBusiness()
  if (!biz) return { error: 'No business profile found.' }

  const customerName = input.customerName.trim()
  if (!customerName) return { error: 'Customer name is required.' }
  if (!input.date || !input.time) return { error: 'Date and time are required.' }

  const timeZone = biz.timezone ?? 'Australia/Adelaide'
  const [y, mo, d] = input.date.split('-').map(Number)
  const [h, mi] = input.time.split(':').map(Number)
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) return { error: 'Invalid date or time.' }
  const scheduledAt = zonedTimeToUtc(timeZone, y, mo, d, h, mi)
  if (scheduledAt.getTime() <= Date.now()) return { error: 'Appointment time must be in the future.' }

  const customerPhone = input.customerPhone.trim()
  const service = input.service.trim() || null

  const supabase = await createClient()
  const { data: inserted, error } = await supabase.from('appointments').insert({
    business_id:    biz.id,
    customer_name:  customerName,
    customer_phone: customerPhone || null,
    service,
    scheduled_at:   scheduledAt.toISOString(),
    status:         'confirmed',
    vapi_call_id:   null,
    staff_id:       input.staffId ?? null,
  }).select('id').single()
  if (error) return { error: error.code === '23505' ? 'That time slot is already booked — pick a different time.' : error.message }

  await rememberCustomerName(supabase, biz.id, input.customerPhone, customerName)

  await sendNotificationEmail(biz, 'appointmentActivity', async () => user?.email ?? null,
    `New appointment — ${customerName}`, `
      <p>${customerName} was booked in${service ? ` for ${service}` : ''} on ${formatInZone(scheduledAt, timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}.</p>
    `)

  if (customerPhone) {
    try {
      const { data: services } = await supabase.from('business_services').select('name, duration_minutes').eq('business_id', biz.id)
      const durationMins = durationFor(service, services ?? [])
      const smsBody = bookingConfirmationSms({
        customerName,
        service,
        businessName: biz.name,
        dateTimeLabel: formatInZone(scheduledAt, timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }),
        durationMinutes: durationMins,
        mapsLink: mapsLink(biz),
      }, biz.sms_template_booking)
      await sendSms(customerPhone, smsBody, biz.twilio_phone_number)
      await supabase.from('appointments').update({ sms_sent: true }).eq('id', inserted!.id)
    } catch (err) {
      // Appointment already saved — a text delivery hiccup shouldn't undo it, same as the AI-booking path.
      console.error('Failed to send manual-booking confirmation SMS:', err)
    }
  }

  revalidatePath('/appointments')
  revalidatePath('/')

  return { error: null }
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
 *
 * Returns `{ error }` instead of throwing for expected/validation failures —
 * see the note on createManualAppointment above.
 */
export async function rescheduleAppointmentAction(input: RescheduleAppointmentInput): Promise<{ error: string | null; smsWarning: string | null }> {
  const { user, business: biz } = await getCurrentBusiness()
  if (!biz) return { error: 'No business profile found.', smsWarning: null }
  if (!input.date || !input.time) return { error: 'Date and time are required.', smsWarning: null }

  const timeZone = biz.timezone ?? 'Australia/Adelaide'
  const [y, mo, d] = input.date.split('-').map(Number)
  const [h, mi] = input.time.split(':').map(Number)
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) return { error: 'Invalid date or time.', smsWarning: null }
  const scheduledAt = zonedTimeToUtc(timeZone, y, mo, d, h, mi)
  if (scheduledAt.getTime() <= Date.now()) return { error: 'Appointment time must be in the future.', smsWarning: null }

  const supabase = await createClient()
  const { data: existing, error: fetchError } = await supabase
    .from('appointments')
    .select('id, service, customer_name, customer_phone, calendar_event_id')
    .eq('id', input.appointmentId)
    .eq('business_id', biz.id)
    .single()
  if (fetchError || !existing) return { error: 'Appointment not found.', smsWarning: null }

  const { error } = await supabase.from('appointments').update({
    scheduled_at: scheduledAt.toISOString(),
    status: 'rescheduled',
  }).eq('id', existing.id)
  if (error) return { error: error.code === '23505' ? 'That time slot is already booked — pick a different time.' : error.message, smsWarning: null }

  const { data: services } = await supabase.from('business_services').select('name, duration_minutes').eq('business_id', biz.id)
  const durationMins = durationFor(existing.service, services ?? [])

  await sendNotificationEmail(biz, 'appointmentActivity', async () => user?.email ?? null,
    `Appointment rescheduled — ${existing.customer_name ?? 'a customer'}`, `
      <p>${existing.customer_name ?? 'A customer'}'s ${existing.service ?? 'appointment'} was moved to ${formatInZone(scheduledAt, timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}.</p>
    `)

  let smsWarning: string | null = null
  if (existing.customer_phone) {
    try {
      const smsBody = rescheduleConfirmationSms({
        customerName: existing.customer_name,
        service: existing.service,
        businessName: biz.name,
        dateTimeLabel: formatInZone(scheduledAt, timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }),
        durationMinutes: durationMins,
        mapsLink: mapsLink(biz),
      }, biz.sms_template_reschedule)
      await sendSms(existing.customer_phone, smsBody, biz.twilio_phone_number)
      await supabase.from('appointments').update({ sms_sent: true }).eq('id', existing.id)
    } catch (err) {
      console.error('Failed to send reschedule confirmation SMS:', err)
      smsWarning = err instanceof Error ? err.message : 'Failed to send confirmation SMS.'
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

  return { error: null, smsWarning }
}

/**
 * Business-owner-triggered cancellation — mirrors the cancelAppointment tool
 * call Ellie uses on the phone (same SMS + Google Calendar event removal).
 *
 * Returns `{ error }` instead of throwing for expected failures — see the
 * note on createManualAppointment above.
 */
export async function cancelAppointmentAction(appointmentId: string): Promise<{ error: string | null; smsWarning: string | null }> {
  const { user, business: biz } = await getCurrentBusiness()
  if (!biz) return { error: 'No business profile found.', smsWarning: null }

  const supabase = await createClient()
  const { data: existing, error: fetchError } = await supabase
    .from('appointments')
    .select('id, service, customer_name, customer_phone, scheduled_at, calendar_event_id')
    .eq('id', appointmentId)
    .eq('business_id', biz.id)
    .single()
  if (fetchError || !existing) return { error: 'Appointment not found.', smsWarning: null }

  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', existing.id)
  if (error) return { error: error.message, smsWarning: null }

  const timeZone = biz.timezone ?? 'Australia/Adelaide'

  await sendNotificationEmail(biz, 'appointmentActivity', async () => user?.email ?? null,
    `Appointment cancelled — ${existing.customer_name ?? 'a customer'}`, `
      <p>${existing.customer_name ?? 'A customer'}'s ${existing.service ?? 'appointment'} on ${formatInZone(new Date(existing.scheduled_at), timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })} was cancelled.</p>
    `)

  let smsWarning: string | null = null
  if (existing.customer_phone) {
    try {
      const smsBody = cancellationConfirmationSms({
        customerName: existing.customer_name,
        service: existing.service,
        businessName: biz.name,
        dateTimeLabel: formatInZone(new Date(existing.scheduled_at), timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }),
      }, biz.sms_template_cancellation)
      await sendSms(existing.customer_phone, smsBody, biz.twilio_phone_number)
    } catch (err) {
      console.error('Failed to send cancellation SMS:', err)
      smsWarning = err instanceof Error ? err.message : 'Failed to send cancellation SMS.'
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

  return { error: null, smsWarning }
}

export type EditAppointmentInput = {
  appointmentId: string
  customerName: string
  customerPhone: string
  service: string
  notes: string
  staffId?: string | null
}

/**
 * Edits the booking's details (name/phone/service/notes) — doesn't touch the time; use rescheduleAppointmentAction for that.
 *
 * Returns `{ error }` instead of throwing for expected failures — see the
 * note on createManualAppointment above.
 */
export async function editAppointmentAction(input: EditAppointmentInput): Promise<{ error: string | null }> {
  const { business: biz } = await getCurrentBusiness()
  if (!biz) return { error: 'No business profile found.' }

  const customerName = input.customerName.trim()
  if (!customerName) return { error: 'Customer name is required.' }

  const supabase = await createClient()
  const { error } = await supabase.from('appointments').update({
    customer_name: customerName,
    customer_phone: input.customerPhone.trim() || null,
    service: input.service.trim() || null,
    notes: input.notes.trim() || null,
    staff_id: input.staffId ?? null,
  }).eq('id', input.appointmentId).eq('business_id', biz.id)
  if (error) return { error: error.message }

  await rememberCustomerName(supabase, biz.id, input.customerPhone, customerName)

  revalidatePath('/appointments')
  revalidatePath('/')

  return { error: null }
}
