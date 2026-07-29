import { Sk } from '@/components/AdminSkeleton'

export default function AdminHomeLoading() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">

        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <Sk w={170} h={26} r={6} />
            <Sk w={240} h={13} r={4} />
          </div>
          <Sk w={128} h={40} r={12} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl px-6 py-5 flex items-center gap-4"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <Sk w={40} h={40} r={12} />
              <div className="flex flex-col gap-2">
                <Sk w={36} h={26} r={6} />
                <Sk w={90} h={11} r={4} />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--b3)' }}>
            <Sk w={130} h={14} r={5} />
            <Sk w={100} h={11} r={4} />
          </div>
          <div className="p-5 grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl p-4 flex flex-col gap-2"
                style={{ background: 'var(--b6)', border: '1px solid var(--border)' }}>
                <Sk w={34} h={22} r={5} />
                <Sk w={60} h={12} r={4} />
                <Sk w={70} h={10} r={4} />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
