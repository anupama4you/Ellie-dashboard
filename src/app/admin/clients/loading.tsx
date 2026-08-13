import { Sk } from '@/components/AdminSkeleton'

const COLS = '2fr 2fr 1fr 1.2fr 1.3fr 80px'

function RowSkeleton({ last }: { last?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-4 md:grid md:items-center md:gap-3 md:px-5"
      style={{ gridTemplateColumns: COLS, borderBottom: last ? 'none' : '1px solid var(--b4)' }}>
      <Sk w={140} h={14} r={5} />
      <Sk w={160} h={12} r={4} />
      <Sk w={70} h={22} r={999} />
      <div className="flex flex-col gap-1.5 pr-2">
        <Sk w={90} h={12} r={4} />
        <Sk full h={6} r={999} />
      </div>
      <Sk w={100} h={12} r={4} />
      <div className="flex items-center gap-1.5 justify-end">
        <Sk w={32} h={32} r={8} />
        <Sk w={32} h={32} r={8} />
      </div>
    </div>
  )
}

export default function AdminClientsLoading() {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <Sk w={100} h={26} r={6} />
            <Sk w={160} h={13} r={4} />
          </div>
          <Sk w={128} h={40} r={12} />
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div className="hidden md:grid px-5 py-3 gap-3"
            style={{ gridTemplateColumns: COLS, borderBottom: '1px solid var(--b3)', background: 'var(--b6)' }}>
            {[70, 60, 40, 60, 80, 30].map((w, i) => <Sk key={i} w={w} h={10} r={3} />)}
          </div>
          {Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} last={i === 7} />)}
        </div>

      </div>
    </div>
  )
}
