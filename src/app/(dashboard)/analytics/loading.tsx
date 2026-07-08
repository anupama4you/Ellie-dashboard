function Sk({ w, h, r = 6, full }: { w?: number | string; h?: number; r?: number; full?: boolean }) {
  return (
    <div className="skeleton"
      style={{ width: full ? '100%' : w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

export default function AnalyticsLoading() {
  return (
    <div className="p-6 flex flex-col gap-5">

      {/* Stat cards row */}
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl p-5 flex flex-col gap-3"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between">
              <Sk w={90} h={11} r={4} />
              <Sk w={30} h={30} r={8} />
            </div>
            <Sk w={80} h={36} r={6} />
            <Sk w={60} h={10} r={4} />
          </div>
        ))}
      </div>

      {/* Main chart */}
      <div className="rounded-2xl p-5"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
        <div className="flex items-center justify-between mb-5">
          <Sk w={120} h={14} r={5} />
          <Sk w={80} h={28} r={8} />
        </div>
        <Sk full h={220} r={8} />
      </div>

      {/* Secondary charts */}
      <div className="grid grid-cols-2 gap-5">
        {[0, 1].map(i => (
          <div key={i} className="rounded-2xl p-5"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <Sk w={110} h={13} r={5} />
            <div className="mt-5">
              <Sk full h={160} r={8} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
