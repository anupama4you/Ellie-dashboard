'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Lock } from 'lucide-react'

export default function SetPasswordPage() {
  const router = useRouter()
  const [checking, setChecking]     = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [alreadySet, setAlreadySet] = useState(false)
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHasSession(!!user)
      setAlreadySet(!!user?.user_metadata?.password_set)
      setChecking(false)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateErr } = await supabase.auth.updateUser({ password, data: { password_set: true } })

    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'var(--night)' }}>

      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(109,74,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(109,74,255,0.08) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 80%)',
        }} />
      <div className="absolute pointer-events-none" style={{ top: '-20%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(109,74,255,0.16) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="absolute pointer-events-none" style={{ bottom: '-15%', right: '-5%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(158,123,255,0.14) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      <div className="w-full max-w-sm relative">
        <div className="flex justify-center mb-8">
          <Image src="/logo.png" alt="Ellie" width={590} height={343} className="h-16 w-auto" />
        </div>

        <div className="rounded-2xl p-8 relative overflow-hidden"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, var(--violet), var(--rose), transparent)' }} />
          <div className="absolute top-0 right-0 w-40 h-40 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(109,74,255,0.06) 0%, transparent 70%)', filter: 'blur(20px)' }} />

          <div className="relative">
            {checking ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--t4)' }} />
              </div>
            ) : !hasSession ? (
              <>
                <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>Invite link expired</h1>
                <p className="text-sm mb-6" style={{ color: 'var(--t4)' }}>
                  This link is no longer valid. Ask your account manager to send a new invite, or sign in below if you&apos;ve already set a password.
                </p>
                <a href="/login" className="block text-center w-full rounded-xl py-3 text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}>
                  Go to sign in
                </a>
              </>
            ) : alreadySet ? (
              <>
                <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>You&apos;re all set</h1>
                <p className="text-sm mb-6" style={{ color: 'var(--t4)' }}>
                  This account already has a password — this invite link has already been used. Head to your dashboard, or contact your account manager if you need your password reset.
                </p>
                <Link href="/" className="block text-center w-full rounded-xl py-3 text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}>
                  Go to dashboard
                </Link>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>Set your password</h1>
                <p className="text-sm mb-6" style={{ color: 'var(--t4)' }}>Choose a password for your Ellie dashboard account.</p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--t3)' }}>
                      <Lock size={11} /> New password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="admin-input"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--t3)' }}>
                      <Lock size={11} /> Confirm password
                    </label>
                    <input
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="admin-input"
                    />
                  </div>

                  {error && (
                    <div className="rounded-xl px-4 py-3 flex items-center gap-2"
                      style={{ background: 'rgba(221,81,64,0.07)', border: '1px solid rgba(221,81,64,0.2)' }}>
                      <p className="text-xs" style={{ color: 'var(--coral)' }}>{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 transition-all mt-1 disabled:opacity-60"
                    style={{
                      background: 'linear-gradient(135deg, var(--violet), var(--rose))',
                      boxShadow: '0 0 24px rgba(109,74,255,0.3)',
                    }}>
                    {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                    {loading ? 'Saving…' : 'Set password & continue'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
