function Sk({ w, h, r = 6 }: { w?: number | string; h?: number; r?: number }) {
  return (
    <div className="skeleton"
      style={{ width: w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center justify-between">
        <Sk w={90} h={11} r={4} />
        <Sk w={26} h={26} r={8} />
      </div>
      <Sk w={60} h={28} r={6} />
      <div className="mt-2">
        <Sk w={110} h={10} r={4} />
      </div>
    </div>
  )
}

function MessageRowSkeleton() {
  return (
    <div className="flex items-start gap-4 px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex flex-col gap-2" style={{ width: 150, flexShrink: 0 }}>
        <Sk w={110} h={13} r={4} />
        <Sk w={90} h={10} r={4} />
      </div>
      <Sk w="100%" h={13} r={4} />
      <div className="flex flex-col gap-2 items-end shrink-0">
        <Sk w={70} h={10} r={4} />
        <Sk w={70} h={20} r={999} />
      </div>
    </div>
  )
}

export default function SmsLoading() {
  return (
    <div className="p-6 max-w-[1220px] mx-auto flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Sk w={140} h={22} r={6} />
        <Sk w={260} h={12} r={4} />
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <Sk w={140} h={14} r={4} />
        </div>
        {Array.from({ length: 5 }).map((_, i) => <MessageRowSkeleton key={i} />)}
      </div>
    </div>
  )
}
