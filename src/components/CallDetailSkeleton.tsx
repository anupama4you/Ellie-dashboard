function Sk({ w, h, r = 6, full }: { w?: number | string; h?: number; r?: number; full?: boolean }) {
  return (
    <div className="skeleton"
      style={{ width: full ? '100%' : w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

export default function CallDetailSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
      {/* Header */}
      <div className="p-5 flex items-center gap-3.5" style={{ borderBottom: '1px solid var(--line)', background: 'var(--card)' }}>
        <Sk w={44} h={44} r={999} />
        <div className="flex-1 flex flex-col gap-2">
          <Sk w={180} h={16} r={5} />
          <Sk w={140} h={12} r={4} />
        </div>
        <Sk w={90} h={26} r={999} />
      </div>

      {/* Stat chips */}
      <div className="p-5 flex flex-wrap gap-2.5" style={{ borderBottom: '1px solid var(--line)', background: 'var(--card)' }}>
        <Sk w={120} h={34} r={999} />
        <Sk w={100} h={34} r={999} />
        <Sk w={140} h={34} r={999} />
        <Sk w={110} h={34} r={999} />
      </div>

      {/* Summary */}
      <div className="p-5 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--line)', background: 'var(--card)' }}>
        <Sk w={70} h={11} r={4} />
        <Sk full h={13} r={4} />
        <Sk w="85%" h={13} r={4} />
      </div>

      {/* Recording */}
      <div className="p-5 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--line)', background: 'var(--card)' }}>
        <Sk w={90} h={11} r={4} />
        <Sk full h={44} r={10} />
      </div>

      {/* Transcript */}
      <div className="p-5 flex flex-col gap-2.5" style={{ background: 'var(--card)' }}>
        <Sk w={90} h={11} r={4} />
        {Array.from({ length: 7 }).map((_, i) => (
          <Sk key={i} w={i % 2 === 0 ? '90%' : '65%'} h={13} r={4} />
        ))}
      </div>
    </div>
  )
}
