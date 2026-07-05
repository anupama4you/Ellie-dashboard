'use client'

import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { VapiCall } from '@/lib/vapi'
import { callDuration } from '@/lib/vapi'

function getLast30Days(calls: VapiCall[]) {
  const days: Record<string, { date: string; calls: number; duration: number }> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days[key] = { date: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }), calls: 0, duration: 0 }
  }
  calls.forEach(c => {
    const key = c.startedAt?.slice(0, 10)
    if (key && days[key]) {
      days[key].calls++
      days[key].duration += callDuration(c)
    }
  })
  return Object.values(days)
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BUCKET_HOURS = 2
const BUCKET_COUNT = 24 / BUCKET_HOURS

function getDayHourHeatmap(calls: VapiCall[]) {
  const grid = Array.from({ length: 7 }, () => Array(BUCKET_COUNT).fill(0))
  calls.forEach(c => {
    if (!c.startedAt) return
    const d = new Date(c.startedAt)
    const dow = (d.getDay() + 6) % 7 // Mon=0..Sun=6
    const bucket = Math.floor(d.getHours() / BUCKET_HOURS)
    grid[dow][bucket]++
  })
  const max = Math.max(1, ...grid.flat())
  return { grid, max }
}

function getOutcomeBreakdown(calls: VapiCall[]) {
  const counts: Record<string, number> = { Handled: 0, Missed: 0, Voicemail: 0, Transferred: 0 }
  calls.forEach(c => {
    if (c.endedReason === 'customer-did-not-answer') counts.Missed++
    else if (c.endedReason === 'voicemail') counts.Voicemail++
    else if (c.endedReason === 'call-transferred') counts.Transferred++
    else counts.Handled++
  })
  return Object.entries(counts).map(([name, value]) => ({ name, value })).filter(d => d.value > 0)
}

const PIE_COLORS = ['var(--signal)', 'var(--violet)', 'var(--amber)', 'var(--coral)']

const cardStyle = { background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }
const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  color: 'var(--ink)',
  fontSize: 12,
}

export default function AnalyticsCharts({ calls, plan }: { calls: VapiCall[]; plan: string }) {
  const daily   = getLast30Days(calls)
  const outcome = getOutcomeBreakdown(calls)
  const { grid: heatGrid, max: heatMax } = getDayHourHeatmap(calls)

  const totalMins   = Math.round(calls.reduce((s, c) => s + (callDuration(c)), 0) / 60)
  const avgDuration = calls.length ? Math.round(calls.reduce((s, c) => s + (callDuration(c)), 0) / calls.length) : 0
  const handledRate = calls.length
    ? Math.round((calls.filter(c => c.endedReason !== 'customer-did-not-answer').length / calls.length) * 100)
    : 0

  const summaryStats = [
    { label: 'Total calls',   value: calls.length,       color: 'var(--violet)' },
    { label: 'Total minutes', value: totalMins,          color: 'var(--rose)'   },
    { label: 'Avg duration',  value: `${avgDuration}s`,  color: 'var(--signal)' },
    { label: 'Handle rate',   value: `${handledRate}%`,  color: 'var(--amber)'  },
  ]

  return (
    <div className="flex flex-col gap-4">

      {/* Summary strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
        {summaryStats.map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl px-5 py-4" style={cardStyle}>
            <div className="text-xs mb-1 font-semibold" style={{ color: 'var(--ink-3)' }}>{label}</div>
            <div className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-display)', color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 30-day volume */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <h2 className="text-sm font-bold mb-5" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Call volume — last 30 days</h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--violet)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--violet)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'var(--ink-3)', fontSize: 10 }} axisLine={false} tickLine={false}
              interval={Math.floor(daily.length / 7)} />
            <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="calls" stroke="var(--violet)" strokeWidth={2}
              fill="url(#aGrad)" dot={false} activeDot={{ r: 4, fill: 'var(--violet)' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">

        {/* Day/hour heatmap */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h2 className="text-sm font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>When people call</h2>
          <div className="overflow-x-auto">
            <div className="grid gap-1" style={{ gridTemplateColumns: `36px repeat(${BUCKET_COUNT}, 1fr)`, minWidth: 480 }}>
              {DOW.map((label, dow) => (
                <div key={label} className="contents">
                  <div className="text-xs font-bold flex items-center" style={{ color: 'var(--ink-3)' }}>{label}</div>
                  {heatGrid[dow].map((count, bucket) => {
                    const alpha = count === 0 ? 0.05 : 0.15 + 0.75 * (count / heatMax)
                    return (
                      <div
                        key={bucket}
                        title={`${label} ${String(bucket * BUCKET_HOURS).padStart(2, '0')}:00 · ${count} call${count !== 1 ? 's' : ''}`}
                        className="rounded"
                        style={{ aspectRatio: 1.4, background: `rgba(109,74,255,${alpha})` }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Outcome pie */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h2 className="text-sm font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>How calls ended</h2>
          {outcome.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={outcome} cx="50%" cy="50%" innerRadius={50} outerRadius={78}
                  paddingAngle={3} dataKey="value">
                  {outcome.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" iconSize={8}
                  formatter={(value) => <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-sm" style={{ color: 'var(--ink-3)' }}>
              No data yet
            </div>
          )}
        </div>
      </div>

      {/* Plan usage */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Monthly plan usage</h2>
          <span className="text-xs capitalize px-2.5 py-0.5 rounded-full font-semibold"
            style={{ background: 'var(--violet-soft)', color: 'var(--violet)', border: '1px solid rgba(109,74,255,0.2)' }}>
            {plan}
          </span>
        </div>
        {(() => {
          const limits: Record<string, number> = { starter: 50, core: 120, professional: 250, enterprise: 500 }
          const limit = limits[plan] ?? 120
          const pct   = Math.min(Math.round((calls.length / limit) * 100), 100)
          const color = pct >= 90 ? 'var(--coral)' : pct >= 70 ? 'var(--amber)' : 'var(--signal)'
          return (
            <div>
              <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--ink-3)' }}>
                <span>{calls.length} calls used</span>
                <span>{limit} call limit</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--paper)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
              </div>
              {pct >= 80 && (
                <p className="text-xs mt-2" style={{ color: 'var(--amber)' }}>
                  {pct >= 90 ? 'Almost at your plan limit — consider upgrading.' : '80% of your monthly calls used.'}
                </p>
              )}
            </div>
          )
        })()}
      </div>

    </div>
  )
}
