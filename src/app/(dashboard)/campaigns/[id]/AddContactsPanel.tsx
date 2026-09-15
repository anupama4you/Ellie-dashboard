'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, UserPlus, X, Download } from 'lucide-react'
import { parseContactsCsv } from '@/lib/outboundCsv'
import { addContactsAction } from '../actions'
import CsvDropzone from '../CsvDropzone'

type ManualContact = { name: string; phone: string; note: string }

/** Collapsed by default (a link/button) — expands into the same CSV + manual
 *  contact-entry pattern the campaign composer uses at creation time, plus
 *  a consent checkbox, since adding contacts is contacting new people the
 *  original campaign-creation consent never covered. */
export default function AddContactsPanel({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [csvContactCount, setCsvContactCount] = useState<number | null>(null)
  const [manualContacts, setManualContacts] = useState<ManualContact[]>([])
  const [consented, setConsented] = useState(false)

  const formRef = useRef<HTMLFormElement>(null)

  async function handleFile(file: File | null) {
    if (!file) { setFileName(null); setCsvContactCount(null); return }
    const text = await file.text()
    setFileName(file.name)
    setCsvContactCount(parseContactsCsv(text).valid.length)
  }

  function addManualContact() {
    setManualContacts(prev => [...prev, { name: '', phone: '', note: '' }])
  }
  function updateManualContact(i: number, field: keyof ManualContact, value: string) {
    setManualContacts(prev => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)))
  }
  function removeManualContact(i: number) {
    setManualContacts(prev => prev.filter((_, idx) => idx !== i))
  }
  const manualFilled = manualContacts.filter(c => c.name.trim() && c.phone.trim())

  const totalToAdd = (csvContactCount ?? 0) + manualFilled.length

  function reset() {
    setFileName(null)
    setCsvContactCount(null)
    setManualContacts([])
    setConsented(false)
    setError('')
    formRef.current?.reset()
  }

  function submit() {
    if (!formRef.current) return
    setError('')
    setResult(null)
    const formData = new FormData(formRef.current)
    formData.set('manualContacts', JSON.stringify(manualFilled))
    startTransition(async () => {
      try {
        const res = await addContactsAction(campaignId, formData)
        setResult(res)
        reset()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add contacts.')
      }
    })
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <button onClick={() => setOpen(true)}
          className="w-fit flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-opacity hover:opacity-90"
          style={{ color: 'var(--violet)', background: 'var(--violet-soft)' }}>
          <UserPlus size={13} /> Add contacts
        </button>
        {result && (
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
            Added {result.added} contact{result.added === 1 ? '' : 's'}
            {result.skipped > 0 ? ` — ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped (missing name/phone or an unrecognisable number)` : ''}.
          </p>
        )}
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={e => e.preventDefault()}
      className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Add contacts</h3>
        <button type="button" onClick={() => { setOpen(false); reset() }} aria-label="Close" style={{ color: 'var(--ink-3)' }}>
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="add-contacts-csv" className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Contacts CSV</label>
          <a href="/sample-campaign-contacts.csv" download
            className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-80" style={{ color: 'var(--violet)' }}>
            <Download size={12} /> Download sample CSV
          </a>
        </div>
        <CsvDropzone inputId="add-contacts-csv" onFileSelected={handleFile} />
        {csvContactCount !== null && (
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{csvContactCount} valid contact{csvContactCount === 1 ? '' : 's'} found in {fileName}.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Or add contacts manually</p>
          <button type="button" onClick={addManualContact}
            className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-80" style={{ color: 'var(--violet)' }}>
            <Plus size={12} /> Add contact
          </button>
        </div>
        {manualContacts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {manualContacts.map((c, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input value={c.name} onChange={e => updateManualContact(i, 'name', e.target.value)}
                  placeholder="Name" className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
                <input value={c.phone} onChange={e => updateManualContact(i, 'phone', e.target.value)}
                  placeholder="Phone" className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
                <input value={c.note} onChange={e => updateManualContact(i, 'note', e.target.value)}
                  placeholder="Note (optional)" className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm" style={{ border: '1px solid var(--line)', color: 'var(--ink)' }} />
                <button type="button" onClick={() => removeManualContact(i)} aria-label="Remove contact"
                  className="p-1.5 rounded-lg shrink-0 transition-opacity hover:opacity-70" style={{ color: 'var(--ink-3)' }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-start gap-2.5 text-xs cursor-pointer" style={{ color: 'var(--ink)' }}>
        <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)} className="mt-0.5" />
        These are my own existing customers and I have the right to contact them.
      </label>

      {error && <p className="text-xs" style={{ color: 'var(--coral)' }}>{error}</p>}

      <div className="flex justify-end gap-2 mt-1">
        <button type="button" onClick={() => { setOpen(false); reset() }} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={isPending || totalToAdd === 0 || !consented}
          className="rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: 'var(--violet)' }}>
          {isPending ? 'Adding…' : `Add ${totalToAdd || ''} contact${totalToAdd === 1 ? '' : 's'}`}
        </button>
      </div>
    </form>
  )
}
