function Sk({ w, h, r = 6 }: { w?: number | string; h?: number; r?: number }) {
  return (
    <div className="skeleton"
      style={{ width: w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderTop: '1px solid var(--line)' }}>
      <Sk w={36} h={36} r={999} />
      <div className="flex-1 flex flex-col gap-2">
        <Sk w={140} h={13} r={4} />
        <Sk w={90} h={10} r={4} />
      </div>
      <Sk w={70} h={22} r={999} />
    </div>
  )
}

export default function CallsLoading() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-4 max-w-[1220px] w-full mx-auto flex flex-col gap-3 shrink-0">
        <Sk w={90} h={22} r={5} />
        <Sk w={260} h={13} r={4} />
      </div>

      <div className="flex-1 min-h-0 px-6 pb-6 max-w-[1220px] w-full mx-auto">
        <div
          className="rounded-2xl h-full flex overflow-hidden"
          style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}
        >
          <div className="w-full lg:w-[400px] shrink-0 h-full flex flex-col" style={{ borderRight: '1px solid var(--line)' }}>
            <div className="p-4 flex flex-col gap-3" style={{ borderBottom: '1px solid var(--line)' }}>
              <Sk w="100%" h={38} r={12} />
              <Sk w="100%" h={38} r={12} />
            </div>
            <div className="flex-1 overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}
            </div>
          </div>
          <div className="flex-1 hidden lg:flex items-center justify-center">
            <Sk w={200} h={13} r={4} />
          </div>
        </div>
      </div>
    </div>
  )
}
