'use client'

import { useState, useTransition } from 'react'
import { X, Plus } from 'lucide-react'
import { createManualAppointment } from '@/app/(dashboard)/appointments/actions'

type ServiceOption = { name: string; durationMinutes: number | null; priceCents: number | null }

export default function AddAppointmentModal({ services, defaultDate }: { services: ServiceOption[]; defaultDate: string }) {
  const [open, setOpen]         = useState(false)
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [service, setService]   = useState('')
  const [date, setDate]         = useState(defaultDate)
  const [time, setTime]         = useState('09:00')
  const [isPending, startTransition] = useTransition()
  const [error, setError]       = useState('')

  function close() {
    setOpen(false)
    setError('')
  }

  function submit() {
    setError('')
    startTransition(async () => {
      try {
        await createManualAppointment({ customerName: name, customerPhone: phone, service, date, time })
        setOpen(false)
        setName(''); setPhone(''); setService('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add appointment')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}
      >
        <Plus size={14} /> Add appointment
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(20,16,32,0.5)' }}
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-3.5"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Add appointment</h2>
              <button onClick={close} style={{ color: 'var(--ink-3)' }} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Customer name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                className="text-sm rounded-lg px-3 py-2"
                style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Phone</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0412 345 678"
                className="text-sm rounded-lg px-3 py-2"
                style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Service</label>
              {services.length > 0 ? (
                <select
                  value={service}
                  onChange={e => setService(e.target.value)}
                  className="text-sm rounded-lg px-3 py-2"
                  style={{ border: '1px solid var(--line)', color: 'var(--ink)', background: 'var(--card)' }}
                >
                  <option value="">—</option>
                  {services.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              ) : (
                <input
                  value={service}
                  onChange={e => setService(e.target.value)}
                  placeholder="Haircut"
                  className="text-sm rounded-lg px-3 py-2"
                  style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="text-sm rounded-lg px-3 py-2"
                  style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Time *</label>
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="text-sm rounded-lg px-3 py-2"
                  style={{ border: '1px solid var(--line)', color: 'var(--ink)' }}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg px-3 py-2" style={{ background: 'var(--coral-soft)' }}>
                <p className="text-xs" style={{ color: 'var(--coral)' }}>{error}</p>
              </div>
            )}

            <button
              onClick={submit}
              disabled={isPending || !name.trim() || !date || !time}
              className="w-full rounded-xl py-2.5 text-sm font-bold text-white mt-1 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}
            >
              {isPending ? 'Adding…' : 'Add appointment'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
