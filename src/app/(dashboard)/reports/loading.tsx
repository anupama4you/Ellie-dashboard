function Sk({ w, h, r = 6, full }: { w?: number | string; h?: number; r?: number; full?: boolean }) {
  return (
    <div className="skeleton"
      style={{ width: full ? '100%' : w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

export default function ReportsLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 flex flex-col gap-6">

        {/* Stat cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-xl px-5 py-4 flex flex-col gap-2.5"
              style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Sk w={80} h={11} r={4} />
              <Sk w={64} h={28} r={6} />
            </div>
          ))}
        </div>

        {/* Main chart */}
        <div className="rounded-xl p-5"
          style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Sk w={200} h={14} r={5} />
          <div className="mt-5"><Sk full h={200} r={8} /></div>
        </div>

        {/* Secondary charts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <div key={i} className="rounded-xl p-5"
              style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Sk w={130} h={13} r={5} />
              <div className="mt-5"><Sk full h={180} r={8} /></div>
            </div>
          ))}
        </div>

        {/* Plan usage */}
        <div className="rounded-xl p-5"
          style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <Sk w={160} h={14} r={5} />
            <Sk w={80} h={24} r={999} />
          </div>
          <div className="flex justify-between mb-2">
            <Sk w={80} h={11} r={4} />
            <Sk w={80} h={11} r={4} />
          </div>
          <Sk full h={8} r={999} />
        </div>

      </div>
    </div>
  )
}
