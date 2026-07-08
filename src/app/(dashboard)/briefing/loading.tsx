function Sk({ w, h, r = 6, full }: { w?: number | string; h?: number; r?: number; full?: boolean }) {
  return (
    <div className="skeleton"
      style={{ width: full ? '100%' : w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

function CardSkeleton({ titleWidth, rows }: { titleWidth: number; rows: number }) {
  return (
    <section className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <div className="px-5 pt-4 pb-3 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--line)' }}>
        <Sk w={titleWidth} h={16} r={5} />
        <Sk w={titleWidth + 60} h={11} r={4} />
      </div>
      <div className="p-5 flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => <Sk key={i} full h={14} r={4} />)}
      </div>
    </section>
  )
}

export default function BriefingLoading() {
  return (
    <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Sk w={220} h={22} r={5} />
          <Sk w={320} h={13} r={4} />
        </div>
        <Sk w={110} h={36} r={10} />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="flex flex-col gap-4">
          <CardSkeleton titleWidth={160} rows={4} />
          <CardSkeleton titleWidth={90} rows={3} />
          <CardSkeleton titleWidth={130} rows={2} />
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeleton titleWidth={120} rows={7} />
          <CardSkeleton titleWidth={170} rows={3} />
          <CardSkeleton titleWidth={190} rows={3} />
        </div>
      </div>
    </div>
  )
}
