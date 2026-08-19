'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'

/** Re-runs the current page's server components (router.refresh()) — for pages showing live data (e.g. from Vapi/Google Calendar) that can change without a client-side navigation happening. */
export default function RefreshButton({ label = 'Refresh' }: { label?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      title="Refresh"
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 btn-ghost"
      style={{ border: '1px solid var(--line)', color: 'var(--ink-2)', background: 'var(--card)' }}
    >
      <RefreshCw size={14} className={isPending ? 'animate-spin' : undefined} />
      {label}
    </button>
  )
}
