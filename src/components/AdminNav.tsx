'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Users, LayoutDashboard, LogOut, ArrowLeft, Loader2, Menu, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/admin',         label: 'Overview', icon: LayoutDashboard, exact: true  },
  { href: '/admin/clients', label: 'Clients',  icon: Users,           exact: false },
]

export default function AdminNav({ pendingReviewCount = 0, usageAlertCount = 0 }: { pendingReviewCount?: number; usageAlertCount?: number }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [mobileOpen, setMobileOpen]     = useState(false)

  // Close the drawer on route change — adjusted during render rather than in
  // an effect, per https://react.dev/learn/you-might-not-need-an-effect.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setMobileOpen(false)
  }

  async function signOut() {
    setIsSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
    {/* Mobile top bar — the nav itself is an off-canvas drawer below md */}
    <div
      className="fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 md:hidden"
      style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b3)' }}
    >
      <button
        onClick={() => setMobileOpen(o => !o)}
        className="w-9 h-9 -ml-1.5 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
        style={{ color: 'var(--text)' }}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      <div className="flex items-center gap-2">
        <Image src="/favicon.png" alt="Ellie" width={64} height={64} className="h-6 w-6 rounded-md" />
        <span className="font-extrabold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Ellie</span>
        <span className="text-[0.6rem] px-1.5 py-0.5 rounded-md font-bold tracking-wide"
          style={{ background: 'rgba(217,138,11,0.12)', color: 'var(--amber)', border: '1px solid rgba(217,138,11,0.25)' }}>
          ADMIN
        </span>
      </div>
      <div className="w-9" />
    </div>

    {/* Backdrop, mobile drawer only */}
    {mobileOpen && (
      <div
        className="fixed inset-0 z-20 md:hidden"
        style={{ background: 'rgba(0,0,0,0.55)' }}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
    )}

    <aside
      className={`fixed md:static top-0 left-0 h-full z-40 md:z-auto w-64 md:w-56 shrink-0 flex flex-col transition-transform duration-200 ease-in-out ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0 overflow-y-auto`}
      style={{ background: 'var(--bg2)', borderRight: '1px solid var(--b2)' }}>

      {/* Logo + admin badge — desktop only, mobile has its own top bar */}
      <div className="hidden md:flex px-4 h-14 items-center gap-2.5 shrink-0"
        style={{ borderBottom: '1px solid var(--b3)' }}>
        <Image src="/favicon.png" alt="Ellie" width={64} height={64} className="h-7 w-7 rounded-md" />
        <span className="font-extrabold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Ellie</span>
        <span className="text-xs px-1.5 py-0.5 rounded-md font-bold tracking-wide"
          style={{ background: 'rgba(217,138,11,0.12)', color: 'var(--amber)', border: '1px solid rgba(217,138,11,0.25)' }}>
          ADMIN
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                color:      active ? 'var(--text)' : 'var(--t7)',
                background: active ? 'linear-gradient(135deg, rgba(109,74,255,0.12), rgba(158,123,255,0.06))' : 'transparent',
                border:     active ? '1px solid rgba(109,74,255,0.18)' : '1px solid transparent',
              }}>
              <Icon size={14} style={{ color: active ? 'var(--violet)' : 'var(--t7)' }} />
              <span className="flex-1">{label}</span>
              {href === '/admin/clients' && pendingReviewCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  title="Businesses with an unreviewed Briefing change"
                  style={{ color: 'var(--amber)', background: 'rgba(217,138,11,0.15)' }}>
                  {pendingReviewCount}
                </span>
              )}
              {href === '/admin/clients' && usageAlertCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  title="Businesses near or over their monthly plan limit"
                  style={{ color: 'var(--coral)', background: 'rgba(221,81,64,0.15)' }}>
                  {usageAlertCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 flex flex-col gap-1">
        <Link href="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all btn-ghost"
          style={{ color: 'var(--t7)', border: '1px solid transparent' }}>
          <ArrowLeft size={14} />
          Client View
        </Link>
        <button onClick={signOut} disabled={isSigningOut}
          className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-left disabled:opacity-60"
          style={{ color: 'var(--t7)', border: '1px solid transparent' }}>
          {isSigningOut
            ? <Loader2 size={14} className="animate-spin" />
            : <LogOut size={14} className="group-hover:text-red-400 transition-colors" />}
          <span className="group-hover:text-red-400 transition-colors">{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
        </button>
      </div>
    </aside>
    </>
  )
}
