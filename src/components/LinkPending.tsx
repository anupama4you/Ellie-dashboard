'use client'

import { useLinkStatus } from 'next/link'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Next.js's route-level loading.tsx does NOT reliably fire for a Link whose
 * target only differs by searchParams on the same page (confirmed directly —
 * see appointments' week-nav, which sat frozen with zero feedback for the
 * whole duration of a slow navigation). useLinkStatus is Next's own
 * documented fix for exactly that gap. Must be rendered as a descendant of
 * the <Link> it's tracking.
 *
 * `icon` takes an already-rendered element (e.g. <ChevronLeft size={15} />),
 * not a component reference — a Server Component parent can't pass a
 * component reference as a prop to a Client Component across the boundary.
 */
export function LinkIconOrSpinner({ icon, size = 14 }: { icon: ReactNode; size?: number }) {
  const { pending } = useLinkStatus()
  return pending ? <Loader2 size={size} className="animate-spin" /> : <>{icon}</>
}

export function LinkPendingFade({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useLinkStatus()
  return (
    <div className={className} style={{ opacity: pending ? 0.45 : 1, transition: 'opacity 150ms' }}>
      {children}
    </div>
  )
}
