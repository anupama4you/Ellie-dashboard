function Sk({ w, h, r = 6 }: { w?: number | string; h?: number; r?: number }) {
  return (
    <div className="skeleton"
      style={{ width: w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

function DayCardSkeleton() {
  return (
    <div className="rounded-xl p-3 flex flex-col items-center gap-2"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <Sk w={26} h={9} r={3} />
      <Sk w={20} h={20} r={4} />
      <Sk w={44} h={16} r={999} />
    </div>
  )
}

function ApptRowSkeleton({ last }: { last?: boolean }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5" style={{ borderTop: last ? undefined : '1px solid var(--line)' }}>
      <Sk w={40} h={11} r={4} />
      <div className="flex-1 flex flex-col gap-2">
        <Sk w={140} h={13} r={4} />
        <Sk w={190} h={10} r={4} />
      </div>
      <Sk w={70} h={22} r={999} />
    </div>
  )
}

export default function AppointmentsLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 sm:p-6 max-w-[1220px] mx-auto flex flex-col gap-4">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex flex-col gap-2">
            <Sk w={160} h={22} r={5} />
            <Sk w={220} h={12} r={4} />
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Sk w={140} h={32} r={10} />
            <div className="flex items-center gap-2">
              <Sk w={40} h={38} r={10} />
              <Sk w={130} h={38} r={10} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2.5">
          {Array.from({ length: 7 }).map((_, i) => <DayCardSkeleton key={i} />)}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <Sk w={90} h={16} r={4} />
            <Sk w={110} h={11} r={4} />
          </div>
          <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            {Array.from({ length: 4 }).map((_, i) => <ApptRowSkeleton key={i} last={i === 0} />)}
          </section>
        </div>
      </div>
    </div>
  )
}
