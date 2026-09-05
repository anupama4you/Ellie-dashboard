'use client'

import { useRef, useState } from 'react'
import { UploadCloud, FileText } from 'lucide-react'

/** Drag-and-drop wrapper around the CSV file input, still submitted through
 * the same <input name="csv"> the parent <form action={createCampaignAction}>
 * reads — dropping a file just populates that hidden input's FileList.
 * `inputId` lets a parent <label htmlFor> stay properly associated with the
 * (visually hidden but still real) file input for accessibility. */
export default function CsvDropzone({ inputId }: { inputId?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setFileName(file.name)
    if (inputRef.current) {
      const dt = new DataTransfer()
      dt.items.add(file)
      inputRef.current.files = dt.files
    }
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setIsDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
      className="rounded-xl px-4 py-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors"
      style={{
        border: `2px dashed ${isDragging ? 'var(--violet)' : 'var(--line)'}`,
        background: isDragging ? 'var(--violet-soft)' : 'var(--paper)',
      }}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        name="csv"
        accept=".csv"
        required
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
      {fileName ? (
        <>
          <FileText size={20} style={{ color: 'var(--violet)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{fileName}</p>
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Click or drop another file to replace it</p>
        </>
      ) : (
        <>
          <UploadCloud size={22} style={{ color: 'var(--ink-3)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Drag a CSV here, or click to browse</p>
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Columns: name, phone, and an optional note</p>
        </>
      )}
    </div>
  )
}
