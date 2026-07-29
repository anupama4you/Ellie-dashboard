export function Sk({ w, h, r = 6, full }: { w?: number | string; h?: number; r?: number; full?: boolean }) {
  return (
    <div className="skeleton"
      style={{ width: full ? '100%' : w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

/** Mirrors AdminClientHeader's layout — shared by the three admin/clients/[id]/* loading states. */
export function AdminClientHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Sk w={36} h={36} r={8} />
        <Sk w={40} h={40} r={999} />
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Sk w={160} h={20} r={5} />
            <Sk w={54} h={18} r={999} />
            <Sk w={130} h={18} r={999} />
          </div>
          <Sk w={150} h={11} r={4} />
        </div>
      </div>
      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
        {[92, 168, 132].map((w, i) => (
          <div key={i} className="px-4 py-2.5">
            <Sk w={w} h={16} r={5} />
          </div>
        ))}
      </div>
    </div>
  )
}
