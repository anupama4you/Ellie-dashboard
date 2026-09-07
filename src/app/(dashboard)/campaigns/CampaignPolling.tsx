'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const POLL_INTERVAL_MS = 8000

/**
 * Auto-refreshes the page while a campaign is actively being worked, so
 * contact statuses/outcomes update as end-of-call-reports land, without a
 * manual reload — same server-refresh-via-router.refresh() pattern the SMS
 * inbox already uses. Paused while the tab isn't visible. Render this only
 * while there's something worth polling for (e.g. an active campaign) —
 * it has no on/off prop itself, so mount/unmount it from the parent.
 */
export default function CampaignPolling() {
  const router = useRouter()
  const [, startTransition] = useTransition()

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') startTransition(() => router.refresh())
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [router])

  return null
}
