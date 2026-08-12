'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, LogOut, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AccountDisabledScreen({ businessName }: { businessName: string }) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="h-screen w-full flex items-center justify-center p-4" style={{ background: 'var(--paper)' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-8 flex flex-col items-center text-center gap-3"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
      >
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--coral-soft)' }}>
          <Ban size={20} style={{ color: 'var(--coral)' }} />
        </div>
        <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
          Account access paused
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          {businessName}&apos;s access to the Ellie dashboard has been paused. Contact your account manager for more information.
        </p>
        <button
          onClick={signOut}
          disabled={signingOut}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold mt-2 disabled:opacity-60"
          style={{ border: '1px solid var(--line)', color: 'var(--ink-2)', background: 'var(--paper)' }}
        >
          {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
          Sign out
        </button>
      </div>
    </div>
  )
}
