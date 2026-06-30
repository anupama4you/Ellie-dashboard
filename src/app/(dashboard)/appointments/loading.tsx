function Sk({ w, h, r = 6 }: { w?: number | string; h?: number; r?: number }) {
  return (
    <div className="skeleton"
      style={{ width: w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

function ApptRowSkeleton() {
  return (
    <div className="flex items-center justify-between px-5 py-4 gap-4"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-3">
        <Sk w={36} h={36} r={12} />
        <div className="flex flex-col gap-2">
          <Sk w={130} h={13} r={4} />
          <Sk w={180} h={10} r={4} />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-2 items-end">
          <Sk w={110} h={13} r={4} />
          <Sk w={70} h={10} r={4} />
        </div>
        <Sk w={80} h={26} r={999} />
      </div>
    </div>
  )
}

function SectionSkeleton({ count }: { count: number }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-5 py-4 flex items-center gap-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="w-1 h-4 rounded-full skeleton" style={{ flexShrink: 0 }} />
        <Sk w={90} h={13} r={4} />
        <Sk w={24} h={20} r={999} />
      </div>
      {Array.from({ length: count }).map((_, i) => <ApptRowSkeleton key={i} />)}
    </div>
  )
}

export default function AppointmentsLoading() {
  return (
    <div className="p-6 flex flex-col gap-5">
      <SectionSkeleton count={3} />
      <SectionSkeleton count={4} />
    </div>
  )
}
