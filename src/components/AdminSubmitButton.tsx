'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

type Props = {
  children: ReactNode
  pendingLabel?: ReactNode
  icon?: ReactNode
  iconSize?: number
  className?: string
  style?: CSSProperties
  title?: string
}

/**
 * Every admin action button lives in a plain <form action={serverAction}>
 * inside a Server Component, so there's no local state to show "this is
 * running" — a slow action (Stripe API calls, Supabase auth admin calls)
 * just looked unresponsive with no feedback until the redirect landed.
 * useFormStatus only works inside the <form>, hence this being its own
 * client component rather than a state flag on the page.
 */
export default function AdminSubmitButton({ children, pendingLabel, icon, iconSize = 13, className, style, title }: Props) {
  const { pending } = useFormStatus()

  return (
    <button type="submit" disabled={pending} title={title}
      className={`${className ?? ''} disabled:opacity-60 disabled:cursor-not-allowed`}
      style={style}>
      {pending ? <Loader2 size={iconSize} className="animate-spin" /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  )
}
