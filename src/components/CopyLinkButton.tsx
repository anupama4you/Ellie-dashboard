'use client'

import { useState, useTransition } from 'react'
import { Link2, Check, Loader2 } from 'lucide-react'

type Props = {
  action: () => Promise<{ url: string } | { error: string }>
  label: string
}

/**
 * Manual fallback for whenever a one-time link needs to reach someone
 * without relying on email delivery (Resend domain issues, provider
 * outage, spam filters) — generates the link and puts it on the clipboard
 * so the admin can hand it over through any channel instead (SMS,
 * WhatsApp, a personal email). Used for both invite/reset links and
 * Stripe payment links — same shape, different server action.
 */
export default function CopyLinkButton({ action, label }: Props) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  function handleClick() {
    startTransition(async () => {
      const result = await action()
      if ('error' in result) {
        console.error(result.error)
        setStatus('error')
      } else {
        await navigator.clipboard.writeText(result.url)
        setStatus('copied')
      }
      setTimeout(() => setStatus('idle'), 2500)
    })
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.07)', border: '1px solid rgba(109,74,255,0.18)' }}>
      {isPending
        ? <Loader2 size={13} className="animate-spin" />
        : status === 'copied' ? <Check size={13} /> : <Link2 size={13} />}
      {status === 'copied' ? 'Link copied!' : status === 'error' ? 'Failed — try again' : label}
    </button>
  )
}
