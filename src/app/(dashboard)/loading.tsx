function Sk({ w, h, r = 6, full }: { w?: number | string; h?: number; r?: number; full?: boolean }) {
  return (
    <div className="skeleton"
      style={{ width: full ? '100%' : w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

export default function TodayLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">

        {/* Greeting */}
        <div className="flex flex-col gap-2">
          <Sk w={260} h={28} r={6} />
          <Sk w={170} h={13} r={4} />
        </div>

        {/* Stats chips */}
        <div className="flex flex-wrap gap-2">
          <Sk w={168} h={36} r={999} />
          <Sk w={110} h={36} r={999} />
          <Sk w={176} h={36} r={999} />
        </div>

        {/* Coming up */}
        <div className="flex flex-col gap-2">
          <Sk w={148} h={11} r={4} />
          <Sk full h={52} r={12} />
          <Sk full h={52} r={12} />
        </div>

        {/* Calls */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Sk w={110} h={11} r={4} />
            <Sk w={55} h={11} r={4} />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <Sk key={i} full h={56} r={12} />
          ))}
        </div>
      </div>
    </div>
  )
}
