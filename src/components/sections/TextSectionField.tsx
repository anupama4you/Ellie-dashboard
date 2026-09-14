'use client'

type Props = {
  title: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
}

/** Plain title + textarea — what the client types is exactly what ends up in the compiled prompt, verbatim, no reformatting. */
export default function TextSectionField({ title, value, onChange, placeholder }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
      </div>
      <div className="p-5">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? 'Write exactly what you want Ellie to know or say here…'}
          rows={6}
          className="w-full rounded-xl px-3.5 py-2.5 text-sm resize-y"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
      </div>
    </div>
  )
}
