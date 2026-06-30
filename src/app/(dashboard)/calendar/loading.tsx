function Sk({ w, h, r = 6, full }: { w?: number | string; h?: number; r?: number; full?: boolean }) {
  return (
    <div className="skeleton"
      style={{ width: full ? '100%' : w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

export default function CalendarLoading() {
  return (
    <div className="flex h-full overflow-hidden">

      {/* Left panel skeleton */}
      <div className="w-72 shrink-0 p-4 flex flex-col gap-4"
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: '#07090f' }}>

        {/* Month nav */}
        <div className="flex items-center justify-between mb-1">
          <Sk w={28} h={28} r={8} />
          <Sk w={140} h={14} r={4} />
          <Sk w={28} h={28} r={8} />
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 7 }).map((_, i) => <Sk key={i} full h={22} r={4} />)}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 35 }).map((_, i) => <Sk key={i} full h={34} r={8} />)}
        </div>
      </div>

      {/* Right panel skeleton */}
      <div className="flex-1 p-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Sk w={200} h={24} r={6} />
          <Sk w={130} h={13} r={4} />
        </div>
        <div className="flex flex-col gap-2">
          <Sk w={130} h={11} r={4} />
          <Sk full h={56} r={12} />
          <Sk full h={56} r={12} />
        </div>
        <div className="flex flex-col gap-2">
          <Sk w={100} h={11} r={4} />
          <Sk full h={56} r={12} />
          <Sk full h={56} r={12} />
          <Sk full h={56} r={12} />
        </div>
      </div>
    </div>
  )
}
