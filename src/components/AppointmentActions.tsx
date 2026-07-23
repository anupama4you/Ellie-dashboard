'use client'

import { useState, useTransition } from 'react'
import { Pencil, CalendarClock, XCircle, X } from 'lucide-react'
import { dateStrInZone } from '@/lib/timezone'
import { rescheduleAppointmentAction, cancelAppointmentAction, editAppointmentAction } from '@/app/(dashboard)/appointments/actions'

type ServiceOption = { name: string }

type Props = {
  appointmentId: string
  customerName: string
  customerPhone: string | null
  service: string | null
  notes: string | null
  scheduledAt: string // ISO
  timeZone: string
  services: ServiceOption[]
}

type ModalKind = 'reschedule' | 'edit' | 'cancel' | null

function timeStrInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

export default function AppointmentActions({
  appointmentId, customerName, customerPhone, service, notes, scheduledAt, timeZone, services,
}: Props) {
  const [modal, setModal]     = useState<ModalKind>(null)
  const apptDate              = new Date(scheduledAt)

  const [date, setDate]       = useState(() => dateStrInZone(apptDate, timeZone))
  const [time, setTime]       = useState(() => timeStrInZone(apptDate, timeZone))

  const [editName, setEditName]   = useState(customerName)
  const [editPhone, setEditPhone] = useState(customerPhone ?? '')
  const [editService, setEditService] = useState(service ?? '')
  const [editNotes, setEditNotes] = useState(notes ?? '')

  const [isPending, startTransition] = useTransition()
  const [error, setError]     = useState('')

  function close() {
    setModal(null)
    setError('')
  }

  function submitReschedule() {
    setError('')
    startTransition(async () => {
      try {
        await rescheduleAppointmentAction({ appointmentId, date, time })
        setModal(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reschedule')
      }
    })
  }

  function submitEdit() {
    setError('')
    startTransition(async () => {
      try {
        await editAppointmentAction({ appointmentId, customerName: editName, customerPhone: editPhone, service: editService, notes: editNotes })
        setModal(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save changes')
      }
    })
  }

  function submitCancel() {
    setError('')
    startTransition(async () => {
      try {
        await cancelAppointmentAction(appointmentId)
        setModal(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to cancel')
      }
    })
  }

  return (
    <>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => setModal('edit')} className="w-7 h-7 rounded-lg flex items-center justify-center btn-ghost" style={{ color: 'var(--ink-3)' }} title="Edit details">
          <Pencil size={12} />
        </button>
        <button onClick={() => setModal('reschedule')} className="w-7 h-7 rounded-lg flex items-center justify-center btn-ghost" style={{ color: 'var(--ink-3)' }} title="Reschedule">
          <CalendarClock size={13} />
        </button>
        <button onClick={() => setModal('cancel')} className="w-7 h-7 rounded-lg flex items-center justify-center btn-ghost" style={{ color: 'var(--coral)' }} title="Cancel appointment">
          <XCircle size={13} />
        </button>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(20,16,32,0.5)' }} onClick={close}>
          <div
            className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-3.5"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
                {modal === 'reschedule' && 'Reschedule appointment'}
                {modal === 'edit' && 'Edit appointment'}
                {modal === 'cancel' && 'Cancel appointment'}
              </h2>
              <button onClick={close} style={{ color: 'var(--ink-3)' }} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {modal === 'reschedule' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Date</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                      className="text-sm rounded-lg px-3 py-2" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Time</label>
                    <input type="time" value={time} onChange={e => setTime(e.target.value)}
                      className="text-sm rounded-lg px-3 py-2" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
                  </div>
                </div>
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  {customerPhone ? "The customer will get an SMS with the new time." : 'No phone on file — no SMS will be sent.'}
                </p>
              </>
            )}

            {modal === 'edit' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Customer name</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="text-sm rounded-lg px-3 py-2" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Phone</label>
                  <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                    className="text-sm rounded-lg px-3 py-2" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Service</label>
                  {services.length > 0 ? (
                    <select value={editService} onChange={e => setEditService(e.target.value)}
                      className="text-sm rounded-lg px-3 py-2" style={{ border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--card)' }}>
                      <option value="">—</option>
                      {services.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  ) : (
                    <input value={editService} onChange={e => setEditService(e.target.value)}
                      className="text-sm rounded-lg px-3 py-2" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Notes</label>
                  <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
                    className="text-sm rounded-lg px-3 py-2" style={{ border: '1px solid var(--line)', color: 'var(--ink)', resize: 'vertical' }} />
                </div>
              </>
            )}

            {modal === 'cancel' && (
              <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
                Cancel {customerName}&apos;s {service || 'appointment'}?
                {customerPhone ? " They'll get an SMS letting them know." : ' No phone on file — no SMS will be sent.'}
                {' '}This can&apos;t be undone from here — they&apos;d need to rebook.
              </p>
            )}

            {error && (
              <div className="rounded-lg px-3 py-2" style={{ background: 'var(--coral-soft)' }}>
                <p className="text-xs" style={{ color: 'var(--coral)' }}>{error}</p>
              </div>
            )}

            {modal === 'cancel' ? (
              <div className="flex gap-2 mt-1">
                <button onClick={close} className="flex-1 rounded-xl py-2.5 text-sm font-bold btn-ghost" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}>
                  Keep it
                </button>
                <button onClick={submitCancel} disabled={isPending}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: 'var(--coral)' }}>
                  {isPending ? 'Cancelling…' : 'Cancel appointment'}
                </button>
              </div>
            ) : (
              <button
                onClick={modal === 'reschedule' ? submitReschedule : submitEdit}
                disabled={isPending || (modal === 'edit' && !editName.trim()) || (modal === 'reschedule' && (!date || !time))}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white mt-1 disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}
              >
                {isPending ? 'Saving…' : modal === 'reschedule' ? 'Save new time' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
