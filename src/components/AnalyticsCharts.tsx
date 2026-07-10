'use client'

import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Clock, TrendingUp, AlarmClockOff, ArrowUp, ArrowDown } from 'lucide-react'
import type { LocalCall } from '@/lib/calls'
import type { PlanUsage } from '@/lib/planUsage'
import type { Hours } from '@/app/(dashboard)/briefing/actions'
import { isAfterHours } from '@/lib/availability'
import { dateStrInZone, addDaysInZone, dayOfWeekInZone, hourInZone, formatInZone } from '@/lib/timezone'

function getLast30Days(calls: LocalCall[], timeZone: string) {
  const now = new Date()
  const days: Record<string, { date: string; calls: number; duration: number }> = {}
  for (let i = 29; i >= 0; i--) {
    const d = addDaysInZone(now, -i, timeZone)
    const key = dateStrInZone(d, timeZone)
    days[key] = { date: formatInZone(d, timeZone, { day: 'numeric', month: 'short' }), calls: 0, duration: 0 }
  }
  calls.forEach(c => {
    const key = c.started_at && dateStrInZone(new Date(c.started_at), timeZone)
    if (key && days[key]) {
      days[key].calls++
      days[key].duration += c.duration_seconds ?? 0
    }
  })
  return Object.values(days)
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BUCKET_HOURS = 2
const BUCKET_COUNT = 24 / BUCKET_HOURS

function getDayHourHeatmap(calls: LocalCall[], timeZone: string) {
  const grid = Array.from({ length: 7 }, () => Array(BUCKET_COUNT).fill(0))
  calls.forEach(c => {
    if (!c.started_at) return
    const d = new Date(c.started_at)
    const dow = (dayOfWeekInZone(d, timeZone) + 6) % 7 // Mon=0..Sun=6
    const bucket = Math.floor(hourInZone(d, timeZone) / BUCKET_HOURS)
    grid[dow][bucket]++
  })
  const max = Math.max(1, ...grid.flat())
  return { grid, max }
}

function partOfDay(hour: number): string {
  if (hour < 6) return 'early mornings'
  if (hour < 12) return 'mornings'
  if (hour < 14) return 'lunchtimes'
  if (hour < 18) return 'afternoons'
  if (hour < 22) return 'evenings'
  return 'late nights'
}

/** Finds the busiest time-of-day bucket (grouping days that share it) and phrases it, e.g. "Tue and Thu lunchtimes are your hottest windows". */
function describeHottestWindow(grid: number[][], max: number): string | null {
  if (max <= 0) return null
  const threshold = Math.max(1, max - 1)
  const byBucket = new Map<number, number[]>()
  grid.forEach((row, dow) => row.forEach((count, bucket) => {
    if (count >= threshold) {
      if (!byBucket.has(bucket)) byBucket.set(bucket, [])
      byBucket.get(bucket)!.push(dow)
    }
  }))
  if (byBucket.size === 0) return null

  let bestBucket = -1
  let bestDays: number[] = []
  for (const [bucket, days] of byBucket) {
    if (days.length > bestDays.length) { bestBucket = bucket; bestDays = days }
  }

  const dayLabels = [...new Set(bestDays)].map(d => DOW[d])
  const dayText = dayLabels.length === 1
    ? dayLabels[0]
    : dayLabels.length === 2
    ? `${dayLabels[0]} and ${dayLabels[1]}`
    : `${dayLabels.slice(0, -1).join(', ')} and ${dayLabels[dayLabels.length - 1]}`
  const timeLabel = partOfDay(bestBucket * BUCKET_HOURS)
  const plural = dayLabels.length > 1
  return `${dayText} ${timeLabel} ${plural ? 'are' : 'is'} your hottest window${plural ? 's' : ''}`
}

const OUTCOME_LEGEND: { key: string; label: string; color: string }[] = [
  { key: 'booked',      label: 'Booked or rebooked',  color: 'var(--signal)' },
  { key: 'enquiry',     label: 'Enquiry answered',    color: 'var(--violet)' },
  { key: 'transferred', label: 'Transferred to you',  color: 'var(--amber)'  },
  { key: 'missed',      label: 'Caller hung up early', color: 'var(--coral)' },
]

function getOutcomeBreakdown(calls: LocalCall[]) {
  const counts: Record<string, number> = { booked: 0, enquiry: 0, transferred: 0, missed: 0 }
  calls.forEach(c => {
    if (c.outcome === 'booked' || c.outcome === 'rebooked') counts.booked++
    else if (c.outcome === 'transferred') counts.transferred++
    else if (c.outcome === 'missed' || c.outcome === 'errored') counts.missed++
    else counts.enquiry++
  })
  return OUTCOME_LEGEND.map(l => ({ ...l, value: counts[l.key] })).filter(d => d.value > 0)
}

function fmtCallLength(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function avgCallLengthCaption(secs: number): string {
  if (secs < 90) return 'Short and to the point'
  if (secs <= 180) return 'Long enough to book, short enough to feel snappy'
  return 'Thorough, unhurried conversations'
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0
  return Math.round(current - previous)
}

function TrendLabel({ delta, rangeDays }: { delta: number | null; rangeDays: number }) {
  if (delta === null) return <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>New this period</span>
  if (delta === 0) return <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Same as previous {rangeDays} days</span>
  const up = delta > 0
  return (
    <span className="text-[11px] flex items-center gap-0.5" style={{ color: up ? 'var(--signal)' : 'var(--coral)' }}>
      {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {Math.abs(delta)}% vs previous {rangeDays} days
    </span>
  )
}

const cardStyle = { background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }
const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  color: 'var(--ink)',
  fontSize: 12,
}

type Props = {
  calls: LocalCall[]
  prevCalls: LocalCall[]
  plan: string
  timeZone: string
  usage: PlanUsage
  hours: Hours | null
  rangeDays: number
}

export default function AnalyticsCharts({ calls, prevCalls, plan, timeZone, usage, hours, rangeDays }: Props) {
  const daily   = getLast30Days(calls, timeZone)
  const outcome = getOutcomeBreakdown(calls)
  const { grid: heatGrid, max: heatMax } = getDayHourHeatmap(calls, timeZone)
  const hottestWindow = describeHottestWindow(heatGrid, heatMax)

  const totalCalls  = calls.length
  const avgDuration = totalCalls ? Math.round(calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / totalCalls) : 0

  const bookedCount = calls.filter(c => c.outcome === 'booked' || c.outcome === 'rebooked').length
  const convRate = totalCalls ? Math.round((bookedCount / totalCalls) * 100) : 0
  const prevBookedCount = prevCalls.filter(c => c.outcome === 'booked' || c.outcome === 'rebooked').length
  const prevConvRate = prevCalls.length ? Math.round((prevBookedCount / prevCalls.length) * 100) : 0
  const convDelta = pctDelta(convRate, prevConvRate)

  const afterHoursCount = calls.filter(c => c.started_at && isAfterHours(new Date(c.started_at), hours, timeZone)).length
  const afterHoursPct = totalCalls ? Math.round((afterHoursCount / totalCalls) * 100) : 0

  return (
    <div className="flex flex-col gap-4">

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-2xl p-4" style={cardStyle}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--violet-soft)' }}>
              <Clock size={13} style={{ color: 'var(--violet)' }} />
            </span>
            <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Avg call length</span>
          </div>
          <p className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>
            {fmtCallLength(avgDuration)}
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>{avgCallLengthCaption(avgDuration)}</p>
        </div>

        <div className="rounded-2xl p-4" style={cardStyle}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--signal-soft)' }}>
              <TrendingUp size={13} style={{ color: 'var(--signal)' }} />
            </span>
            <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Booking conversion</span>
          </div>
          <p className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>
            {convRate}%
          </p>
          <div className="mt-1"><TrendLabel delta={convDelta} rangeDays={rangeDays} /></div>
        </div>

        <div className="rounded-2xl p-4" style={cardStyle}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--coral-soft)' }}>
              <AlarmClockOff size={13} style={{ color: 'var(--coral)' }} />
            </span>
            <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Calls outside hours</span>
          </div>
          <p className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--ink)' }}>
            {afterHoursCount}
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>{afterHoursPct}% of all calls came while you were closed</p>
        </div>
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
          <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>When people call</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>Calls by day and hour · darker means busier</p>
          <div className="overflow-x-auto">
            <div style={{ minWidth: 480 }}>
              <div className="grid gap-1" style={{ gridTemplateColumns: `36px repeat(${BUCKET_COUNT}, 1fr)` }}>
                <div />
                {Array.from({ length: BUCKET_COUNT }).map((_, bucket) => (
                  <div key={bucket} className="text-[10px] text-center" style={{ color: 'var(--ink-4, var(--ink-3))' }}>
                    {bucket * BUCKET_HOURS === 0 ? 12 : bucket * BUCKET_HOURS > 12 ? bucket * BUCKET_HOURS - 12 : bucket * BUCKET_HOURS}
                  </div>
                ))}
                {DOW.map((label, dow) => (
                  <div key={label} className="contents">
                    <div className="text-xs font-bold flex items-center" style={{ color: 'var(--ink-3)' }}>{label}</div>
                    {heatGrid[dow].map((count, bucket) => {
                      const alpha = count === 0 ? 0.05 : 0.15 + 0.75 * (count / heatMax)
                      const hour = bucket * BUCKET_HOURS
                      const hourLabel = `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'am' : 'pm'}`
                      return (
                        <div key={bucket} className="relative group">
                          <div
                            className="rounded"
                            style={{ aspectRatio: 1.4, background: `rgba(109,74,255,${alpha})` }}
                          />
                          <div
                            className="absolute z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{
                              bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6,
                              background: 'var(--night, #211A31)', color: '#fff', fontSize: 11, fontWeight: 600,
                              padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                            }}
                          >
                            {label} {hourLabel} · about {count} call{count !== 1 ? 's' : ''}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2 mt-3">
            <div className="flex items-center gap-3">
              {[
                { label: 'Quiet', alpha: 0.1 },
                { label: 'Steady', alpha: 0.45 },
                { label: 'Busy', alpha: 0.9 },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: `rgba(109,74,255,${l.alpha})` }} />
                  {l.label}
                </span>
              ))}
            </div>
            {hottestWindow && (
              <span className="text-[11px] font-semibold" style={{ color: 'var(--coral)' }}>{hottestWindow}</span>
            )}
          </div>
        </div>

        {/* Outcome donut */}
        <div className="rounded-2xl p-5" style={cardStyle}>
          <h2 className="text-sm font-bold mb-0.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>How calls ended</h2>
          <p className="text-xs mb-2" style={{ color: 'var(--ink-3)' }}>{totalCalls} call{totalCalls !== 1 ? 's' : ''} this period</p>
          {outcome.length > 0 ? (
            <div className="flex items-center gap-5">
              <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={outcome} cx="50%" cy="50%" innerRadius={54} outerRadius={78} paddingAngle={3} dataKey="value">
                      {outcome.map((o, i) => <Cell key={i} fill={o.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="font-extrabold text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{totalCalls}</span>
                  <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>calls</span>
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-2.5">
                {outcome.map(o => (
                  <div key={o.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: o.color }} />
                      <span className="truncate" style={{ color: 'var(--ink-2)' }}>{o.label}</span>
                    </span>
                    <span className="font-semibold shrink-0" style={{ color: 'var(--ink)' }}>{o.value}</span>
                  </div>
                ))}
              </div>
            </div>
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
            {usage.isTrial ? 'Free trial' : plan}
          </span>
        </div>
        {usage.isTrial ? (
          <div>
            <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--ink-3)' }}>
              <span>{usage.used} calls used so far</span>
              <span>Unlimited during trial</span>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--violet)' }}>
              {usage.trialDaysLeft != null && usage.trialDaysLeft > 0
                ? `${usage.trialDaysLeft} day${usage.trialDaysLeft !== 1 ? 's' : ''} left in your trial.`
                : 'Your trial has ended.'}
              {' '}Ends {formatInZone(usage.renewsAt, timeZone, { day: 'numeric', month: 'long' })}.
            </p>
          </div>
        ) : (() => {
          const pct    = usage.pct ?? 0
          const barPct = Math.min(pct, 100)
          const color  = pct >= 90 ? 'var(--coral)' : pct >= 70 ? 'var(--amber)' : 'var(--signal)'
          return (
            <div>
              <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--ink-3)' }}>
                <span>{usage.used} calls used this cycle</span>
                <span>{usage.limit} call limit</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--paper)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${barPct}%`, background: color }} />
              </div>
              {pct >= 80 && (
                <p className="text-xs mt-2" style={{ color: 'var(--amber)' }}>
                  {pct >= 100 ? "You're over your plan's included calls — consider upgrading." : pct >= 90 ? 'Almost at your plan limit — consider upgrading.' : '80% of this cycle\'s calls used.'}
                </p>
              )}
              <p className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
                Usage renews {formatInZone(usage.renewsAt, timeZone, { day: 'numeric', month: 'long' })}
              </p>
            </div>
          )
        })()}
      </div>

    </div>
  )
}
