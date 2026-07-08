function Sk({ w, h, r = 6 }: { w?: number | string; h?: number; r?: number }) {
  return (
    <div className="skeleton"
      style={{ width: w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

function RecordingRowSkeleton({ isFirst }: { isFirst: boolean }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5"
      style={{ borderTop: isFirst ? undefined : '1px solid var(--line)' }}>
      <div className="flex flex-col gap-2" style={{ width: 150 }}>
        <Sk w={110} h={13} r={4} />
        <Sk w={90} h={10} r={4} />
      </div>
      <div className="flex-1">
        <Sk w="100%" h={32} r={999} />
      </div>
      <Sk w={40} h={12} r={4} />
      <div className="flex items-center gap-1.5 shrink-0">
        <Sk w={32} h={32} r={8} />
        <Sk w={32} h={32} r={8} />
      </div>
    </div>
  )
}

export default function RecordingsLoading() {
  return (
    <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Sk w={140} h={22} r={5} />
        <Sk w={280} h={13} r={4} />
      </div>

      <section className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <RecordingRowSkeleton key={i} isFirst={i === 0} />
        ))}
      </section>
    </div>
  )
}
