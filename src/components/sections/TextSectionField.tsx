'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pencil, Eye } from 'lucide-react'

type Props = {
  title: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
}

/** Splits one paragraph's text on **bold**, legacy <!-- briefing:key -->
 *  markers (still literal text in the compiled prompt, just inert — kept
 *  visible but visually de-emphasized rather than hidden), and line
 *  breaks. Returns plain React text nodes only — never raw HTML — so
 *  there's no injection risk from rendering a client's own edited text. */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|<!--[\s\S]*?-->|\n)/g)
  return parts.filter(Boolean).map((part, i) => {
    if (part === '\n') return <br key={i} />
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i} style={{ color: 'var(--text)' }}>{part.slice(2, -2)}</strong>
    }
    if (/^<!--[\s\S]*?-->$/.test(part)) {
      return (
        <span key={i} style={{ color: 'var(--t3)', fontStyle: 'italic' }}
          title="A leftover marker from the old prompt format — no longer functional, safe to remove.">
          {part}
        </span>
      )
    }
    return part
  })
}

/** Line-based: blank lines separate paragraphs, "- "/"* " lines become a
 *  bulleted row with a coloured marker, everything else flows as prose
 *  through renderInline(). Handles what actually shows up in these
 *  sections (bold, bullet lists, legacy HTML-comment markers) rather than
 *  full CommonMark — headers aren't included here since a section's own
 *  heading is stored separately (title/heading_level), not inside its body. */
function renderMarkdownPreview(text: string): ReactNode {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let paragraph: string[] = []

  function flush(key: string) {
    if (paragraph.length === 0) return
    blocks.push(<p key={key} className="mb-3 last:mb-0">{renderInline(paragraph.join('\n'))}</p>)
    paragraph = []
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed === '') {
      flush(`p-${i}`)
    } else if (/^[-*]\s+/.test(trimmed)) {
      flush(`p-${i}`)
      blocks.push(
        <div key={`li-${i}`} className="flex gap-2 mb-1.5">
          <span style={{ color: 'var(--violet)' }}>•</span>
          <span>{renderInline(trimmed.replace(/^[-*]\s+/, ''))}</span>
        </div>
      )
    } else {
      paragraph.push(line)
    }
  })
  flush('p-end')
  return blocks
}

/** Title + editable textarea, with an Edit/Preview toggle — Preview renders
 *  bold text, bullets, and legacy markers with real formatting instead of
 *  raw punctuation. What the client types is still exactly what ends up in the
 *  compiled prompt, verbatim, no reformatting — Preview is read-only, edits
 *  only ever happen in the textarea. The textarea auto-grows to fit its
 *  content (no internal scrollbar) instead of a fixed 6-row box. */
export default function TextSectionField({ title, value, onChange, placeholder }: Props) {
  const [mode, setMode] = useState<'edit' | 'preview'>('preview')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el || mode !== 'edit') return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value, mode])

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--b3)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'var(--bg2)' }}>
          <button type="button" onClick={() => setMode('edit')}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors"
            style={{ background: mode === 'edit' ? 'var(--bg3)' : 'transparent', color: mode === 'edit' ? 'var(--text)' : 'var(--t3)' }}>
            <Pencil size={11} /> Edit
          </button>
          <button type="button" onClick={() => setMode('preview')}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors"
            style={{ background: mode === 'preview' ? 'var(--bg3)' : 'transparent', color: mode === 'preview' ? 'var(--text)' : 'var(--t3)' }}>
            <Eye size={11} /> Preview
          </button>
        </div>
      </div>
      <div className="p-5">
        {mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder ?? 'Write exactly what you want Ellie to know or say here…'}
            rows={3}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm resize-none overflow-hidden"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: '4.5rem' }}
          />
        ) : (
          <div className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
            {value.trim() ? renderMarkdownPreview(value) : <span style={{ color: 'var(--t3)' }}>Nothing here yet.</span>}
          </div>
        )}
      </div>
    </div>
  )
}
