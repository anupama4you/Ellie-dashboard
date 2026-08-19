'use client'

import Link from 'next/link'
import { useTopLoader } from 'nextjs-toploader'
import { useNavigationBlocker } from '@/lib/navigationBlocker'

type Props = React.ComponentProps<typeof Link>

/** Drop-in replacement for next/link that confirms before leaving a page with unsaved changes (see NavigationBlockerProvider). */
export default function BlockableLink({ children, ...props }: Props) {
  const { isBlocked } = useNavigationBlocker()
  const topLoader = useTopLoader()

  return (
    <Link
      onNavigate={e => {
        if (isBlocked && !window.confirm('You have unsaved changes. Leave without saving?')) {
          e.preventDefault()
          // NextTopLoader starts its progress bar from its own document-level
          // click listener, unconditionally, for every internal link click —
          // it doesn't check event.defaultPrevented and has no idea we just
          // cancelled the navigation. That listener sits on `document`, which
          // (being an ancestor of the React root) only receives the click
          // AFTER this onNavigate handler already ran, so calling done() here
          // fires too early — before the bar has even started — and gets
          // clobbered moments later when NextTopLoader's own listener starts
          // it for real. Deferring to the next tick lets that listener finish
          // first, so done() actually lands after it.
          setTimeout(() => topLoader.done(true), 0)
        }
      }}
      {...props}
    >
      {children}
    </Link>
  )
}
