function Sk({ w, h, r = 6, full }: { w?: number | string; h?: number; r?: number; full?: boolean }) {
  return (
    <div className="skeleton"
      style={{ width: full ? '100%' : w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

function TableRowSkeleton() {
  return (
    <div className="grid items-center px-5 gap-4 py-4"
      style={{
        gridTemplateColumns: '32px 1fr 160px 80px 140px 40px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
      <Sk w={32} h={32} r={8} />
      <div className="flex items-center gap-2">
        <Sk w={24} h={24} r={999} />
        <Sk w={160} h={18} r={6} />
      </div>
      <div className="flex flex-col gap-2">
        <Sk w={100} h={13} r={4} />
        <Sk w={60} h={10} r={4} />
      </div>
      <Sk w={50} h={13} r={4} />
      <Sk w={100} h={26} r={999} />
      <Sk w={32} h={32} r={8} />
    </div>
  )
}

export default function CallsLoading() {
  return (
    <div className="p-6">
      {/* Summary strip */}
      <div className="flex items-center gap-6 mb-4 px-1">
        <Sk w={70} h={12} r={4} />
        <Sk w={100} h={12} r={4} />
      </div>

      <div className="rounded-xl overflow-hidden"
        style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Header */}
        <div className="grid px-5 py-3 gap-4"
          style={{
            gridTemplateColumns: '32px 1fr 160px 80px 140px 40px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
          {[32, 80, 100, 50, 90, 40].map((w, i) => (
            <Sk key={i} w={w} h={10} r={3} />
          ))}
        </div>

        {/* Rows */}
        {Array.from({ length: 10 }).map((_, i) => <TableRowSkeleton key={i} />)}
      </div>
    </div>
  )
}
