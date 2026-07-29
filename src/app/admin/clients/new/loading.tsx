import { Sk } from '@/components/AdminSkeleton'

function Field({ labelW = 80, h = 40 }: { labelW?: number; h?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Sk w={labelW} h={10} r={3} />
      <Sk full h={h} r={10} />
    </div>
  )
}

export default function NewClientLoading() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-lg mx-auto flex flex-col gap-5">

        <div className="flex items-center gap-3">
          <Sk w={32} h={32} r={8} />
          <div className="flex flex-col gap-2">
            <Sk w={180} h={20} r={5} />
            <Sk w={280} h={11} r={4} />
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
            <Sk w={100} h={14} r={5} />
          </div>
          <div className="p-5 flex flex-col gap-4">
            <Field labelW={50} />
            <Field labelW={100} />
            <Field labelW={50} />
            <Field labelW={40} />
            <Sk full h={58} r={12} />
            <Field labelW={110} />
            <Sk full h={46} r={12} />
          </div>
        </div>

      </div>
    </div>
  )
}
