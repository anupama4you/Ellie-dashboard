function Sk({ w, h, r = 6 }: { w?: number | string; h?: number; r?: number }) {
  return (
    <div className="skeleton"
      style={{ width: w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

export default function SettingsLoading() {
  return (
    <div className="p-6 max-w-xl">
      <div className="rounded-2xl overflow-hidden"
        style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Header */}
        <div className="px-5 py-4 flex flex-col gap-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full skeleton" style={{ flexShrink: 0 }} />
            <Sk w={130} h={13} r={4} />
          </div>
          <Sk w={220} h={10} r={4} />
        </div>

        {/* Fields */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center px-5 py-4 gap-4"
            style={{ borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <div className="flex items-center gap-2.5">
              <Sk w={24} h={24} r={6} />
              <Sk w={110} h={11} r={4} />
            </div>
            <Sk w={160} h={13} r={4} />
          </div>
        ))}
      </div>
    </div>
  )
}
