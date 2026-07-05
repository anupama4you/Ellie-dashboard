'use client'

import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts'

export type WeekDay = { label: string; calls: number; bookings: number }

export default function WeeklyCallsChart({ data }: { data: WeekDay[] }) {
  const chartData = data.map(d => ({ ...d, remainder: Math.max(0, d.calls - d.bookings) }))

  return (
    <div style={{ height: 130 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} barCategoryGap="24%">
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--ink-3)', fontSize: 11, fontWeight: 600 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--paper)' }}
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--ink)', fontWeight: 600 }}
            formatter={(value, name) =>
              name === 'remainder' ? [] : [value, name === 'bookings' ? 'Bookings' : 'Calls']
            }
          />
          <Bar dataKey="bookings" stackId="a" fill="var(--signal)" radius={[0, 0, 3, 3]} maxBarSize={30} />
          <Bar dataKey="remainder" stackId="a" fill="var(--violet)" radius={[6, 6, 0, 0]} maxBarSize={30} name="calls" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
