import { Sk, AdminClientHeaderSkeleton } from '@/components/AdminSkeleton'

function Field({ labelW = 60, span = false }: { labelW?: number; span?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5" style={span ? { gridColumn: '1 / -1' } : undefined}>
      <Sk w={labelW} h={10} r={3} />
      <Sk full h={40} r={10} />
    </div>
  )
}

export default function AdminClientDetailsLoading() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">

        <AdminClientHeaderSkeleton />

        <div className="grid gap-5" style={{ gridTemplateColumns: '1.4fr 1fr' }}>

          <div className="rounded-2xl overflow-hidden h-fit" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
              <Sk w={100} h={14} r={5} />
            </div>
            <div className="p-5 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field labelW={40} span />
              <Field labelW={90} span />
              <Field labelW={40} />
              <Field labelW={30} />
              <Field labelW={70} span />
              <Field labelW={110} span />
              <Field labelW={130} span />
              <div style={{ gridColumn: '1 / -1' }}>
                <Sk full h={46} r={12} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--b3)' }}>
                <Sk w={80} h={14} r={5} />
                <Sk w={40} h={18} r={999} />
              </div>
              <div className="p-5 flex flex-col gap-3">
                <Sk full h={13} r={4} />
                <Sk w="80%" h={13} r={4} />
                <Sk full h={40} r={12} />
                <Sk full h={40} r={12} />
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
                <Sk w={70} h={14} r={5} />
              </div>
              <div className="p-5">
                <Sk full h={40} r={12} />
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden px-5 py-4 flex items-center justify-between"
              style={{ background: 'var(--bg3)', border: '1px solid rgba(221,81,64,0.18)' }}>
              <Sk w={90} h={14} r={5} />
              <Sk w={90} h={11} r={4} />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
