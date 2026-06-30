'use client'

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { VapiCall } from '@/lib/vapi'

type Appointment = { scheduled_at: string; status: string }

function getLast7Days(calls: VapiCall[], appointments: Appointment[]) {
  const days: Record<string, { day: string; calls: number; bookings: number }> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en-AU', { weekday: 'short' })
    days[key] = { day: label, calls: 0, bookings: 0 }
  }
  calls.forEach(c => {
    const key = c.startedAt?.slice(0, 10)
    if (key && days[key]) days[key].calls++
  })
  appointments.forEach(a => {
    const key = a.scheduled_at?.slice(0, 10)
    if (key && days[key]) days[key].bookings++
  })
  return Object.values(days)
}

const tooltipStyle = {
  backgroundColor: '#0d1117',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#e2e8f0',
  fontSize: '12px',
}

export default function OverviewCharts({ calls, appointments }: { calls: VapiCall[]; appointments: Appointment[] }) {
  const data = getLast7Days(calls, appointments)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

      {/* Calls chart */}
      <div className="rounded-xl p-5"
        style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-white">Calls — Last 7 Days</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
            {calls.length} total
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="violetGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(167,139,250,0.15)' }} />
            <Area type="monotone" dataKey="calls" stroke="#a78bfa" strokeWidth={2}
              fill="url(#violetGrad)" dot={false} activeDot={{ r: 4, fill: '#a78bfa' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bookings chart */}
      <div className="rounded-xl p-5"
        style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-white">Appointments — Last 7 Days</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(244,114,182,0.1)', color: '#f472b6' }}>
            {appointments.length} total
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(244,114,182,0.06)' }} />
            <Bar dataKey="bookings" fill="#f472b6" radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
