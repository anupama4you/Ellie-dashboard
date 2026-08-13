import { Sk, AdminClientHeaderSkeleton } from '@/components/AdminSkeleton'

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--b3)' }}>
        <Sk w={130} h={14} r={5} />
        <Sk w={70} h={16} r={999} />
      </div>
      <div className="p-5 flex flex-col gap-2.5">
        {Array.from({ length: rows }).map((_, i) => <Sk key={i} full h={16} r={5} />)}
      </div>
    </div>
  )
}

export default function AdminBriefingLoading() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-[1220px] mx-auto flex flex-col gap-4">

        <AdminClientHeaderSkeleton />

        <Sk w={420} h={11} r={4} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionSkeleton rows={4} />
          <SectionSkeleton rows={3} />
          <SectionSkeleton rows={5} />
          <SectionSkeleton rows={2} />
        </div>

      </div>
    </div>
  )
}
