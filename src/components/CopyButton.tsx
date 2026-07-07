'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard API unavailable — silently ignore, not critical
    }
  }

  return (
    <button
      onClick={copy}
      className="inline-flex items-center justify-center shrink-0 rounded-md transition-colors"
      style={{ width: 20, height: 20, color: copied ? 'var(--signal)' : 'var(--ink-3)' }}
      title={copied ? 'Copied!' : 'Copy phone number'}
      aria-label="Copy phone number"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}
