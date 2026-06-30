'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Mail, Lock } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'var(--bg)' }}>

      {/* Grid background */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(167,139,250,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 80%)',
        }} />

      {/* Ambient orbs */}
      <div className="absolute pointer-events-none" style={{ top: '-20%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="absolute pointer-events-none" style={{ bottom: '-15%', right: '-5%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,114,182,0.07) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      <div className="w-full max-w-sm relative">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="/logo.png" alt="Ellie" width={200} height={64} className="h-16 w-auto" />
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8 relative overflow-hidden"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>

          {/* Top gradient line */}
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #a78bfa, #f472b6, transparent)' }} />

          {/* Card ambient */}
          <div className="absolute top-0 right-0 w-40 h-40 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.06) 0%, transparent 70%)', filter: 'blur(20px)' }} />

          <div className="relative">
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>Welcome back</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--t4)' }}>Sign in to your Ellie dashboard</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--t3)' }}>
                  <Mail size={11} /> Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@yourbusiness.com.au"
                  required
                  className="admin-input"
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--t3)' }}>
                  <Lock size={11} /> Password
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

              {/* Error */}
              {error && (
                <div className="rounded-xl px-4 py-3 flex items-center gap-2"
                  style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)' }}>
                  <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 transition-all mt-1 disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #a78bfa, #f472b6)',
                  boxShadow: '0 0 24px rgba(167,139,250,0.3)',
                }}>
                {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-5">
          <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(167,139,250,0.3)' }} />
          <p className="text-xs" style={{ color: 'var(--t6)' }}>
            Powered by <span style={{ color: '#a78bfa' }}>ellie.ai</span> · anupama.dev
          </p>
          <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(167,139,250,0.3)' }} />
        </div>
      </div>
    </div>
  )
}
