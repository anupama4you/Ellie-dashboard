function Sk({ w, h, r = 6, full }: { w?: number | string; h?: number; r?: number; full?: boolean }) {
  return (
    <div className="skeleton"
      style={{ width: full ? '100%' : w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

function TileSkeleton() {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3.5" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center justify-between">
        <Sk w={40} h={40} r={12} />
        <Sk w={80} h={20} r={999} />
      </div>
      <div className="flex flex-col gap-2">
        <Sk w={100} h={15} r={5} />
        <Sk full h={12} r={4} />
        <Sk w="70%" h={12} r={4} />
      </div>
      <Sk full h={36} r={8} />
    </div>
  )
}

export default function IntegrationsLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1100px] mx-auto flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Sk w={150} h={26} r={6} />
          <Sk w={280} h={13} r={4} />
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {Array.from({ length: 9 }).map((_, i) => <TileSkeleton key={i} />)}
        </div>
      </div>
    </div>
  )
}
