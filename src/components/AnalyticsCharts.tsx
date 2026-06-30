'use client'

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { VapiCall } from '@/lib/vapi'
import { callDuration } from '@/lib/vapi'
import { useTheme } from '@/context/theme'

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

function getHourDistribution(calls: VapiCall[]) {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    calls: 0,
  }))
  calls.forEach(c => {
    if (c.startedAt) {
      const h = new Date(c.startedAt).getHours()
      hours[h].calls++
    }
  })
  return hours.filter((_, i) => i >= 7 && i <= 20)
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

const PIE_COLORS = ['#a78bfa', '#f472b6', '#34d399', '#fbbf24']

export default function AnalyticsCharts({ calls, plan }: { calls: VapiCall[]; plan: string }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const cardBg     = isDark ? '#0d1117' : '#ffffff'
  const cardBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'
  const gridColor  = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'
  const tick1      = isDark ? '#334155' : '#94a3b8'
  const tick2      = isDark ? '#475569' : '#64748b'
  const titleColor = isDark ? '#e2e8f0' : '#0f172a'
  const labelColor = isDark ? '#475569' : '#64748b'
  const trackBg    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
  const noDataColor = isDark ? '#334155' : '#94a3b8'
  const legendColor = isDark ? '#94a3b8' : '#475569'

  const tooltipStyle = {
    backgroundColor: cardBg,
    border: `1px solid ${cardBorder}`,
    borderRadius: '8px',
    color: titleColor,
    fontSize: '12px',
  }

  const daily   = getLast30Days(calls)
  const hourly  = getHourDistribution(calls)
  const outcome = getOutcomeBreakdown(calls)

  const totalMins   = Math.round(calls.reduce((s, c) => s + (callDuration(c)), 0) / 60)
  const avgDuration = calls.length ? Math.round(calls.reduce((s, c) => s + (callDuration(c)), 0) / calls.length) : 0
  const handledRate = calls.length
    ? Math.round((calls.filter(c => c.endedReason !== 'customer-did-not-answer').length / calls.length) * 100)
    : 0

  const summaryStats = [
    { label: 'Total Calls',   value: calls.length,               color: '#a78bfa' },
    { label: 'Total Minutes', value: totalMins,                  color: '#f472b6' },
    { label: 'Avg Duration',  value: `${avgDuration}s`,          color: '#34d399' },
    { label: 'Handle Rate',   value: `${handledRate}%`,          color: '#fbbf24' },
  ]

  return (
    <div className="flex flex-col gap-6">

      {/* Summary strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {summaryStats.map(({ label, value, color }) => (
          <div key={label} className="rounded-xl px-5 py-4"
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="text-xs mb-1" style={{ color: labelColor }}>{label}</div>
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 30-day volume */}
      <div className="rounded-xl p-5"
        style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
        <h2 className="text-sm font-semibold mb-5" style={{ color: titleColor }}>Call Volume — Last 30 Days</h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridColor} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: tick1, fontSize: 10 }} axisLine={false} tickLine={false}
              interval={Math.floor(daily.length / 7)} />
            <YAxis tick={{ fill: tick2, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="calls" stroke="#a78bfa" strokeWidth={2}
              fill="url(#aGrad)" dot={false} activeDot={{ r: 4, fill: '#a78bfa' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Hourly heatmap */}
        <div className="rounded-xl p-5"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <h2 className="text-sm font-semibold mb-5" style={{ color: titleColor }}>Peak Call Hours</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: tick1, fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fill: tick2, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(167,139,250,0.06)' }} />
              <Bar dataKey="calls" fill="#a78bfa" radius={[3, 3, 0, 0]} maxBarSize={22} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Outcome pie */}
        <div className="rounded-xl p-5"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <h2 className="text-sm font-semibold mb-5" style={{ color: titleColor }}>Call Outcomes</h2>
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
                  formatter={(value) => <span style={{ color: legendColor, fontSize: 12 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-sm" style={{ color: noDataColor }}>
              No data yet
            </div>
          )}
        </div>
      </div>

      {/* Plan usage */}
      <div className="rounded-xl p-5"
        style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: titleColor }}>Monthly Plan Usage</h2>
          <span className="text-xs capitalize px-2.5 py-0.5 rounded-full font-semibold"
            style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)' }}>
            {plan}
          </span>
        </div>
        {(() => {
          const limits: Record<string, number> = { starter: 50, core: 120, professional: 250, enterprise: 500 }
          const limit = limits[plan] ?? 120
          const pct   = Math.min(Math.round((calls.length / limit) * 100), 100)
          const color = pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#34d399'
          return (
            <div>
              <div className="flex justify-between text-xs mb-2" style={{ color: labelColor }}>
                <span>{calls.length} calls used</span>
                <span>{limit} call limit</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: trackBg }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
              </div>
              {pct >= 80 && (
                <p className="text-xs mt-2" style={{ color: '#fbbf24' }}>
                  {pct >= 90 ? '⚠ Almost at your plan limit — consider upgrading.' : '📈 80% of your monthly calls used.'}
                </p>
              )}
            </div>
          )
        })()}
      </div>

    </div>
  )
}
