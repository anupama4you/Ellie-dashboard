import { Sk, AdminClientHeaderSkeleton } from '@/components/AdminSkeleton'

export default function AdminPromptLoading() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-[1220px] mx-auto flex flex-col gap-4">

        <AdminClientHeaderSkeleton />

        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--b3)' }}>
            <Sk w={140} h={14} r={5} />
            <div className="flex gap-2">
              <Sk w={100} h={30} r={8} />
              <Sk w={130} h={30} r={8} />
            </div>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Sk w={100} h={10} r={3} />
              <Sk full h={40} r={10} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Sk w={120} h={10} r={3} />
              <Sk full h={360} r={12} />
            </div>
            <div className="flex justify-end gap-2">
              <Sk w={110} h={38} r={10} />
              <Sk w={150} h={38} r={10} />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
