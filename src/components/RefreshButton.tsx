'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'

/** Re-runs the current page's server components (router.refresh()) — for pages showing live data (e.g. from Vapi/Google Calendar) that can change without a client-side navigation happening. */
export default function RefreshButton({
  label = 'Refresh',
  variant = 'light',
}: {
  label?: string
  /** 'light' matches the client dashboard's card theme (default); 'dark' matches the admin panel's. */
  variant?: 'light' | 'dark'
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const style = variant === 'dark'
    ? { border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--bg3)' }
    : { border: '1px solid var(--line)', color: 'var(--ink-2)', background: 'var(--card)' }

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      title="Refresh"
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 btn-ghost shrink-0"
      style={style}
    >
      <RefreshCw size={14} className={isPending ? 'animate-spin' : undefined} />
      {label}
    </button>
  )
}
